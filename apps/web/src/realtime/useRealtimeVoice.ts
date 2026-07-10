import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live voice conversation with a generated persona, relayed through our own
 * server (never DashScope directly — the browser must never see the API
 * key). The server speaks OpenAI-Realtime-shaped JSON events over a plain
 * WebSocket and transparently proxies them to/from DashScope's qwen-omni
 * realtime voice model.
 *
 * Hackathon tradeoff: mic capture uses a ScriptProcessorNode (deprecated but
 * universally supported and simple) instead of an AudioWorklet, and
 * downsampling to 16kHz is nearest-neighbor decimation, not a proper
 * resampler. Good enough for a live demo.
 */

export interface RealtimeVoiceOptions {
  wsUrl: string;
  instructions: string;
  voiceId: string;
}

export type RealtimeVoiceStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "unavailable"
  | "error";

export interface RealtimeVoiceState {
  status: RealtimeVoiceStatus;
  transcript: string[];
  errorMessage?: string;
}

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

/** Downsample (nearest-neighbor decimation) Float32 PCM to `targetRate`. */
function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === INPUT_SAMPLE_RATE) return input;
  const ratio = inputRate / INPUT_SAMPLE_RATE;
  const outLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = Math.floor(i * ratio);
    output[i] = input[srcIndex] ?? 0;
  }
  return output;
}

/** Float32 [-1,1] PCM -> Int16 PCM (clamped). */
function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    output[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return output;
}

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Int16 PCM (s16le) -> Float32 [-1,1] PCM. */
function int16PCMToFloat32(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const length = Math.floor(buffer.byteLength / 2);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const sample = view.getInt16(i * 2, true);
    output[i] = sample < 0 ? sample / 32768 : sample / 32767;
  }
  return output;
}

export function useRealtimeVoice(
  opts: RealtimeVoiceOptions,
): RealtimeVoiceState & { start(): Promise<void>; stop(): void } {
  const [status, setStatus] = useState<RealtimeVoiceStatus>("idle");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  // Keep latest opts in a ref so start() doesn't need to be redeclared on
  // every prop change (and so effect cleanup always sees fresh values).
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const outputCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const pendingTranscriptRef = useRef("");
  const closingRef = useRef(false);

  const teardownAudio = useCallback(() => {
    // Mic capture side.
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current.onaudioprocess = null;
      scriptNodeRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) track.stop();
      micStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    // Playback side.
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
    }
    activeSourcesRef.current = [];
    if (outputCtxRef.current) {
      void outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    nextPlayTimeRef.current = 0;
  }, []);

  const stop = useCallback(() => {
    closingRef.current = true;
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    teardownAudio();
    pendingTranscriptRef.current = "";
    setStatus("idle");
  }, [teardownAudio]);

  /** Barge-in: drop any queued/playing audio immediately. */
  const clearPlayback = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
    }
    activeSourcesRef.current = [];
    if (outputCtxRef.current) {
      nextPlayTimeRef.current = outputCtxRef.current.currentTime;
    }
  }, []);

  const playAudioDelta = useCallback((base64: string) => {
    if (!outputCtxRef.current) {
      outputCtxRef.current = new AudioContext();
      nextPlayTimeRef.current = outputCtxRef.current.currentTime;
    }
    const ctx = outputCtxRef.current;
    const pcmBuffer = base64ToArrayBuffer(base64);
    const float32 = int16PCMToFloat32(pcmBuffer);
    if (float32.length === 0) return;

    const audioBuffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startAt = Math.max(nextPlayTimeRef.current, ctx.currentTime);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      if (
        activeSourcesRef.current.length === 0 &&
        outputCtxRef.current &&
        nextPlayTimeRef.current <= outputCtxRef.current.currentTime + 0.05
      ) {
        setStatus((prev) => (prev === "speaking" ? "listening" : prev));
      }
    };

    setStatus("speaking");
  }, []);

  const handleServerMessage = useCallback(
    (raw: string) => {
      let msg: { type?: string; message?: string; delta?: string } | undefined;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== "string") return;

      switch (msg.type) {
        case "error": {
          const wasFirstMessage = status === "connecting";
          setErrorMessage(msg.message ?? "实时语音连接出错");
          setStatus(wasFirstMessage ? "unavailable" : "error");
          stop();
          break;
        }
        case "response.audio.delta": {
          if (msg.delta) playAudioDelta(msg.delta);
          break;
        }
        case "response.audio_transcript.delta":
        case "response.text.delta": {
          if (msg.delta) pendingTranscriptRef.current += msg.delta;
          break;
        }
        case "response.audio_transcript.done":
        case "response.text.done": {
          const line = pendingTranscriptRef.current.trim();
          pendingTranscriptRef.current = "";
          if (line) setTranscript((prev) => [...prev, line]);
          break;
        }
        case "input_audio_buffer.speech_started": {
          clearPlayback();
          setStatus("listening");
          break;
        }
        default:
          break;
      }
    },
    [status, playAudioDelta, clearPlayback, stop],
  );

  const startMicPipeline = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: INPUT_SAMPLE_RATE },
      });
    } catch {
      setErrorMessage("麦克风权限被拒绝");
      setStatus("error");
      stop();
      return;
    }
    micStreamRef.current = stream;

    const inputCtx = new AudioContext();
    inputCtxRef.current = inputCtx;
    const source = inputCtx.createMediaStreamSource(stream);
    micSourceRef.current = source;

    const scriptNode = inputCtx.createScriptProcessor(
      SCRIPT_PROCESSOR_BUFFER_SIZE,
      1,
      1,
    );
    scriptNodeRef.current = scriptNode;

    scriptNode.onaudioprocess = (event) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleTo16k(input, inputCtx.sampleRate);
      const pcm16 = floatTo16BitPCM(downsampled);
      const base64 = arrayBufferToBase64(pcm16.buffer);
      ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: base64 }));
    };

    source.connect(scriptNode);
    // ScriptProcessorNode only fires onaudioprocess while connected into the
    // graph; route to destination via a silent path (zero-gain) is not
    // required in Chromium but Safari needs an active connection.
    scriptNode.connect(inputCtx.destination);

    setStatus((prev) => (prev === "connecting" ? "listening" : prev));
  }, [stop]);

  const start = useCallback(async () => {
    if (wsRef.current) return; // already started
    closingRef.current = false;
    setErrorMessage(undefined);
    setTranscript([]);
    pendingTranscriptRef.current = "";
    setStatus("connecting");

    const ws = new WebSocket(optsRef.current.wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            voice: optsRef.current.voiceId,
            input_audio_format: "pcm",
            output_audio_format: "pcm",
            instructions: optsRef.current.instructions,
            turn_detection: {
              type: "semantic_vad",
              threshold: 0.5,
              silence_duration_ms: 800,
            },
          },
        }),
      );
      void startMicPipeline();
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data === "string") handleServerMessage(event.data);
    });

    ws.addEventListener("close", () => {
      if (closingRef.current) return;
      // Server closed unexpectedly (e.g. right after the error message).
      wsRef.current = null;
      teardownAudio();
      setStatus((prev) => (prev === "connecting" ? "unavailable" : "idle"));
    });

    ws.addEventListener("error", () => {
      // The subsequent "close" event drives the actual state transition;
      // this just prevents an unhandled-rejection-style console spam.
    });
  }, [handleServerMessage, startMicPipeline, teardownAudio]);

  // Always clean up on unmount, even if stop() was never called.
  useEffect(() => {
    return () => {
      closingRef.current = true;
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      teardownAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, transcript, errorMessage, start, stop };
}

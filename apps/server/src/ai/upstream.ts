import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "@vibe/shared";
import { env, resolveModel } from "../env";

/**
 * Thin proxy to an OpenAI-compatible upstream. This is the ONLY place that
 * touches provider credentials. Queue (BullMQ), caching, and multi-provider
 * routing slot in here post-hackathon without touching routes.
 */
export async function upstreamChatStream(params: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  enableThinking?: boolean;
  thinkingBudget?: number;
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const body: Record<string, unknown> = {
    model: resolveModel(params.model),
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
    stream: true,
  };
  if (params.enableThinking) {
    body.enable_thinking = true;
    body.thinking_budget = params.thinkingBudget ?? 2000;
  }
  const res = await fetch(`${env.ai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.ai.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Upstream ${res.status}: ${await res.text()}`);
  }
  return res.body;
}

/** Parse upstream OpenAI-style SSE and re-emit our minimal `{text}` frames. */
export async function* extractDeltas(upstream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
          };
          // Only surface the final answer text; reasoning_content (thinking) is
          // intentionally ignored here even though DashScope emits it as a
          // separate field on the same delta object when enable_thinking is set.
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          // ignore malformed keep-alive frames
        }
      }
    }
  }
}

interface BlSpawnResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runBl(args: string[]): Promise<BlSpawnResult> {
  const proc = Bun.spawn({ cmd: ["bl", ...args], stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { stdout, stderr, code };
}

/**
 * Resolve the concrete image model per the product's style knob.
 * wan2.7-image-pro is the current Wanxiang flagship (confirmed on Bailian's
 * official model list, https://help.aliyun.com/zh/model-studio/models) and
 * gives the best "collectible figurine" look for this product. Do NOT swap
 * in wan2.6-t2i for speed — it's explicitly documented as a legacy/earlier
 * model, superseded by the 2.7 generation. Live-tested latency across the
 * current-gen options: wan2.7-image-pro ~66-84s, wan2.7-image (non-pro)
 * ~92s (no faster, despite the name — the whole 2.7 family runs in this
 * range), qwen-image-2.0-pro ~160s (dominated, not used). There is no fast
 * current-gen option at this quality tier; the ~70s wait is handled by the
 * "crafting" phase copy/animation in apps/web/src/persona/PersonaFlow.tsx
 * instead of downgrading model generation.
 */
export function resolveImageModel(opts: { model?: string; style?: "qwen" | "wan" }): string {
  if (opts.model) return opts.model;
  if (opts.style === "wan") return "wan2.7-image-pro";
  if (opts.style === "qwen") return "qwen-image-2.0";
  return env.ai.models.image;
}

export interface UpstreamImageResult {
  /** data: URI — always CORS-safe for <img>/canvas/three textures. */
  url: string;
  /** The original signed https OSS url (short-lived), when available — needed by
   * downstream services (e.g. Tripo 3D generation) that require a fetchable
   * https source instead of a data URI. May expire after a while. */
  ossUrl?: string;
}

/**
 * Generate an image via the `bl` CLI (owns DashScope async-task auth/polling),
 * then re-fetch the resulting (signed, CORS-restricted) OSS url server-side and
 * return the bytes as a data URI so the browser can use it in <img>/canvas/three
 * textures with zero CORS risk. Also returns the original https OSS url so
 * callers that need a fetchable https source (e.g. Tripo 3D generation) have
 * one available without re-hosting anything.
 */
export async function upstreamImage(
  prompt: string,
  opts?: { model?: string; style?: "qwen" | "wan" },
): Promise<UpstreamImageResult> {
  const model = resolveImageModel(opts ?? {});
  const outDir = tmpdir();
  const { stdout, stderr, code } = await runBl([
    "image",
    "generate",
    "--prompt",
    prompt,
    "--model",
    model,
    "--size",
    "1:1",
    "--watermark",
    "false",
    "--out-dir",
    outDir,
    "--output",
    "json",
  ]);
  if (code !== 0) {
    throw new Error(`bl image generate failed (exit ${code}): ${stderr || stdout}`);
  }
  let parsed: { urls?: string[]; error?: { message?: string } };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`bl image generate returned non-JSON output: ${stdout}`);
  }
  if (parsed.error) {
    throw new Error(`bl image generate error: ${parsed.error.message ?? JSON.stringify(parsed.error)}`);
  }
  const ossUrl = parsed.urls?.[0];
  if (!ossUrl) {
    throw new Error(`bl image generate returned no urls: ${stdout}`);
  }

  const imgRes = await fetch(ossUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to fetch generated image bytes: ${imgRes.status}`);
  }
  const buf = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const contentType = imgRes.headers.get("content-type") ?? "image/png";
  return { url: `data:${contentType};base64,${base64}`, ossUrl };
}

/**
 * Synthesize speech via the `bl` CLI, returning raw audio bytes (mp3) read
 * back from the temp file `bl` wrote to.
 */
export async function upstreamTts(
  text: string,
  voiceId: string,
  model?: string,
): Promise<ArrayBuffer> {
  const resolvedModel = model ?? env.ai.models.tts;
  const outPath = join(tmpdir(), `tts-${randomUUID()}.mp3`);
  const { stderr, code } = await runBl([
    "speech",
    "synthesize",
    "--text",
    text,
    "--voice",
    voiceId,
    "--model",
    resolvedModel,
    "--format",
    "mp3",
    "--out",
    outPath,
    "--output",
    "json",
  ]);
  if (code !== 0) {
    throw new Error(`bl speech synthesize failed (exit ${code}): ${stderr}`);
  }
  try {
    const bytes = await Bun.file(outPath).arrayBuffer();
    return bytes;
  } finally {
    await Bun.file(outPath)
      .delete()
      .catch(() => {});
  }
}

/**
 * Recognize speech via the `bl` CLI (FunAudio-ASR). Writes the uploaded audio
 * bytes to a tmp file, shells out, and returns the transcript.
 *
 * VERIFIED: unlike `bl image generate`/`bl speech synthesize`, `bl speech
 * recognize`'s stdout with `--output json` is the PLAIN transcript text, not
 * a JSON object — confirmed via a live TTS->ASR round trip in this exact
 * environment (`[Model: ...] [Mode: async] [Files: 1]` goes to stderr; stdout
 * is only the recognized text). Do not JSON.parse stdout here.
 */
export async function upstreamAsr(audioBuffer: ArrayBuffer, extension: string): Promise<string> {
  const inPath = join(tmpdir(), `asr-${randomUUID()}.${extension}`);
  await Bun.write(inPath, audioBuffer);
  try {
    const { stdout, stderr, code } = await runBl([
      "speech",
      "recognize",
      "--url",
      inPath,
      "--language",
      "zh",
      "--output",
      "json",
    ]);
    if (code !== 0) {
      throw new Error(`bl speech recognize failed (exit ${code}): ${stderr || stdout}`);
    }
    const text = stdout.trim();
    if (!text) {
      throw new Error(`bl speech recognize returned empty transcript: ${stderr}`);
    }
    return text;
  } finally {
    await Bun.file(inPath)
      .delete()
      .catch(() => {});
  }
}

/** POST /api/ai/3d — kick off an async Tripo 3D-generation task via raw DashScope REST. */
export async function upstream3dCreate(imageUrl: string, model?: string): Promise<string> {
  const modelId = `Tripo/${model ?? env.ai.models.threeD}`;
  const res = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/3d-generation",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.ai.apiKey}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: modelId,
        input: { image: imageUrl },
        parameters: { texture_quality: "standard" },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`3D task creation failed ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { output?: { task_id?: string } };
  const taskId = json.output?.task_id;
  if (!taskId) throw new Error(`3D task creation returned no task_id: ${JSON.stringify(json)}`);
  return taskId;
}

export interface ThreeDPollResult {
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "UNKNOWN";
  glbUrl?: string;
  previewUrl?: string;
}

/** GET /api/ai/3d/:taskId — poll DashScope for task status/results. */
export async function upstream3dPoll(taskId: string): Promise<ThreeDPollResult> {
  const res = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
    headers: { authorization: `Bearer ${env.ai.apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`3D task poll failed ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    output?: {
      task_status?: ThreeDPollResult["status"];
      results?: Array<{ pbr_model_url?: string; rendered_image_url?: string }>;
    };
  };
  const status = json.output?.task_status ?? "UNKNOWN";
  if (status === "SUCCEEDED") {
    const result = json.output?.results?.[0];
    return {
      status,
      glbUrl: result?.pbr_model_url,
      previewUrl: result?.rendered_image_url,
    };
  }
  return { status };
}

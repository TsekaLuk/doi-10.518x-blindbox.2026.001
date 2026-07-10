import { parseSceneGraph, parseTimeline, type SceneGraph, type Timeline } from "@vibe/scene";
import { API_ROUTES, PersonaSchema, type ChatMessage, type Persona } from "@vibe/shared";
import { MODELS, createStaticRouter } from "../models";
import {
  PERSONA_SYSTEM_PROMPT,
  SCENE_GRAPH_SYSTEM_PROMPT,
  TIMELINE_SYSTEM_PROMPT,
  extractJson,
} from "../prompts";
import type { AIService, CallOptions, ModelRouter } from "../types";

export interface HttpAIServiceConfig {
  /** Base URL of the Hono proxy, e.g. http://localhost:8787 */
  baseUrl: string;
  router?: ModelRouter;
}

/**
 * MVP implementation: plain fetch against the thin backend proxy.
 * The proxy holds the API key; this class never sees provider credentials.
 */
export function createHttpAIService(config: HttpAIServiceConfig): AIService {
  const router = config.router ?? createStaticRouter();
  const url = (p: string) => new URL(p, config.baseUrl).toString();

  async function complete(messages: ChatMessage[], opts?: CallOptions): Promise<string> {
    let out = "";
    for await (const delta of stream(messages, opts)) out += delta;
    return out;
  }

  async function* stream(messages: ChatMessage[], opts?: CallOptions): AsyncIterable<string> {
    const res = await fetch(url(API_ROUTES.aiStream), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages,
        model: opts?.model ?? router.route("chat"),
        temperature: opts?.temperature,
        enableThinking: opts?.enableThinking,
        thinkingBudget: opts?.thinkingBudget,
      }),
      signal: opts?.signal,
    });
    if (!res.ok || !res.body) throw new Error(`AI proxy error ${res.status}: ${await res.text()}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        const evt = JSON.parse(data) as { text?: string; error?: string };
        if (evt.error) throw new Error(evt.error);
        if (evt.text) yield evt.text;
      }
    }
  }

  return {
    chat: complete,
    chatStream: stream,

    async vision(prompt, imageUrl, opts) {
      return complete(
        [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        { ...opts, model: opts?.model ?? router.route("vision") },
      );
    },

    async generateSceneGraph(prompt, opts): Promise<SceneGraph> {
      const raw = await complete(
        [
          { role: "system", content: SCENE_GRAPH_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        opts,
      );
      return parseSceneGraph(extractJson(raw));
    },

    async generateTimeline(prompt, scene, opts): Promise<Timeline> {
      const raw = await complete(
        [
          { role: "system", content: TIMELINE_SYSTEM_PROMPT },
          { role: "user", content: `Scene graph:\n${JSON.stringify(scene)}\n\nRequest: ${prompt}` },
        ],
        opts,
      );
      return parseTimeline(extractJson(raw));
    },

    async generateImage(prompt, opts) {
      const res = await fetch(url(API_ROUTES.aiImage), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, model: opts?.model ?? MODELS.image, style: opts?.style }),
        signal: opts?.signal,
      });
      if (!res.ok) throw new Error(`Image generation failed: ${res.status}`);
      const json = (await res.json()) as { url: string };
      return json.url;
    },

    async generatePersona(prompt, opts): Promise<Persona> {
      // Retry the whole completion up to 3 attempts: flaky networks reset the
      // upstream SSE mid-stream, and the model can occasionally emit JSON that
      // fails schema validation — both are safely retryable from scratch.
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const raw = await complete(
            [
              { role: "system", content: PERSONA_SYSTEM_PROMPT },
              { role: "user", content: prompt },
            ],
            { thinkingBudget: 1500, ...opts, enableThinking: opts?.enableThinking ?? true },
          );
          return PersonaSchema.parse(extractJson(raw));
        } catch (err) {
          lastErr = err;
          if (opts?.signal?.aborted) throw err;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      throw lastErr;
    },

    async synthesizeSpeech(text, voiceId, opts) {
      const res = await fetch(url(API_ROUTES.aiTts), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, voiceId, model: opts?.model }),
        signal: opts?.signal,
      });
      if (!res.ok) throw new Error(`Speech synthesis failed: ${res.status}`);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
  };
}

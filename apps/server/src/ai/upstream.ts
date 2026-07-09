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
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${env.ai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.ai.apiKey}`,
    },
    body: JSON.stringify({
      model: resolveModel(params.model),
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      stream: true,
    }),
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
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          // ignore malformed keep-alive frames
        }
      }
    }
  }
}

export async function upstreamImage(prompt: string, model?: string): Promise<string> {
  const res = await fetch(`${env.ai.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.ai.apiKey}`,
    },
    body: JSON.stringify({ model: resolveModel(model ?? "nano-banana-2-lite"), prompt, n: 1 }),
  });
  if (!res.ok) throw new Error(`Upstream image ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
  const item = json.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error("Upstream returned no image");
}

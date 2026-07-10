import { trpcServer } from "@hono/trpc-server";
import { API_ROUTES, type ChatMessage } from "@vibe/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { realtimeHandler, websocket } from "./ai/realtime";
import {
  extractDeltas,
  upstream3dCreate,
  upstream3dPoll,
  upstreamAsr,
  upstreamChatStream,
  upstreamImage,
  upstreamTts,
} from "./ai/upstream";
import { env } from "./env";
import { auth } from "./middleware/auth";
import { appRouter } from "./routers";

const app = new Hono();

app.use("*", cors());
app.use("*", auth);

app.get(API_ROUTES.health, (c) => c.json({ ok: true }));

// Typed RPC. Reserved middleware slots (auth/db/queue) wrap here, routes untouched.
app.use(
  `${API_ROUTES.trpc}/*`,
  trpcServer({
    router: appRouter,
    createContext: (_opts, c) => ({ user: c.get("user") }),
  }),
);

// Token streaming: thin SSE proxy over the OpenAI-compatible upstream.
app.post(API_ROUTES.aiStream, async (c) => {
  const body = (await c.req.json()) as {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    enableThinking?: boolean;
    thinkingBudget?: number;
  };
  return streamSSE(c, async (stream) => {
    try {
      const upstream = await upstreamChatStream({ ...body, signal: c.req.raw.signal });
      for await (const text of extractDeltas(upstream)) {
        await stream.writeSSE({ event: "delta", data: JSON.stringify({ text }) });
      }
      await stream.writeSSE({ event: "done", data: "[DONE]" });
    } catch (err) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: err instanceof Error ? err.message : "upstream error" }),
      });
    }
  });
});

app.post(API_ROUTES.aiImage, async (c) => {
  const { prompt, model, style } = (await c.req.json()) as {
    prompt: string;
    model?: string;
    style?: "qwen" | "wan";
  };
  const result = await upstreamImage(prompt, { model, style });
  return c.json(result);
});

app.post(API_ROUTES.aiTts, async (c) => {
  const { text, voiceId, model } = (await c.req.json()) as {
    text: string;
    voiceId: string;
    model?: string;
  };
  const bytes = await upstreamTts(text, voiceId, model);
  return new Response(bytes, { headers: { "content-type": "audio/mpeg" } });
});

app.post(API_ROUTES.aiAsr, async (c) => {
  const format = c.req.header("x-audio-format") ?? "webm";
  const bytes = await c.req.arrayBuffer();
  const text = await upstreamAsr(bytes, format);
  return c.json({ text });
});

app.post(API_ROUTES.ai3d, async (c) => {
  const { imageUrl, model } = (await c.req.json()) as { imageUrl: string; model?: string };
  const taskId = await upstream3dCreate(imageUrl, model);
  return c.json({ taskId });
});

app.get(`${API_ROUTES.ai3d}/:taskId`, async (c) => {
  const taskId = c.req.param("taskId");
  const result = await upstream3dPoll(taskId);
  return c.json(result);
});

app.get(API_ROUTES.aiRealtime, realtimeHandler);

console.log(`[vibe] server on :${env.port} (proxy -> ${env.ai.baseUrl})`);

export default {
  port: env.port,
  fetch: app.fetch,
  websocket,
  // Bun's default is 10s. Persona/thinking-mode completions, `bl` image/TTS
  // subprocesses, and 3D task polling routinely take longer than that before
  // the first byte — without this, Bun kills the connection mid-stream.
  idleTimeout: 120,
};

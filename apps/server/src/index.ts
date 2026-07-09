import { trpcServer } from "@hono/trpc-server";
import { API_ROUTES, type ChatMessage } from "@vibe/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { extractDeltas, upstreamChatStream, upstreamImage } from "./ai/upstream";
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

app.post("/api/ai/image", async (c) => {
  const { prompt, model } = (await c.req.json()) as { prompt: string; model?: string };
  const url = await upstreamImage(prompt, model);
  return c.json({ url });
});

console.log(`[vibe] server on :${env.port} (proxy -> ${env.ai.baseUrl})`);

export default {
  port: env.port,
  fetch: app.fetch,
};

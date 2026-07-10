export const config = { maxDuration: 120 };

declare const process: any;
declare const Buffer: any;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-audio-format",
};

const apiKey = () => process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY || "";
const baseUrl = () => process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const model = (key: string, fallback: string) => process.env[key] || fallback;

function sendJson(res: any, status: number, body: unknown) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(body));
}

async function readBody(req: any): Promise<any> {
  const chunks: any[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function readJson(req: any) {
  const body = await readBody(req);
  return body.length ? JSON.parse(body.toString("utf8")) : {};
}

function routePath(req: any): string {
  return new URL(req.url || "/", "https://persona.local").pathname;
}

function resolveModel(input: string | undefined): string {
  switch (input) {
    case undefined:
    case "default":
      return model("AI_MODEL_DEFAULT", "qwen3.7-plus");
    case "vision":
      return model("AI_MODEL_VISION", "qwen-vl-max");
    case "image":
      return model("AI_MODEL_IMAGE", "wan2.7-image-pro");
    case "fast":
      return model("AI_MODEL_FAST", "qwen3.6-flash");
    default:
      return input;
  }
}

async function dashscopeJson(path: string, init: RequestInit & { asyncTask?: boolean }) {
  const key = apiKey();
  if (!key) throw new Error("Missing AI_API_KEY");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${key}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.asyncTask) headers["X-DashScope-Async"] = "enable";
  const res = await fetch(`https://dashscope.aliyuncs.com${path}`, { ...init, headers });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text}`);
  return json;
}

async function handleStream(req: any, res: any) {
  const body = await readJson(req);
  const upstream = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: resolveModel(body.model),
      messages: body.messages,
      temperature: body.temperature ?? 0.7,
      stream: true,
      ...(body.enableThinking
        ? { enable_thinking: true, thinking_budget: body.thinkingBudget ?? 2000 }
        : {}),
    }),
  });
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    res.end(`event: error\ndata: ${JSON.stringify({ error: `Upstream ${upstream.status}: ${text}` })}\n\n`);
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() || "";
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const text = json.choices?.[0]?.delta?.content;
            if (text) res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
          } catch {
            // Ignore upstream keep-alives and malformed frames.
          }
        }
      }
    }
    res.write("event: done\ndata: [DONE]\n\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : "stream error";
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

async function pollTask(taskId: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await dashscopeJson(`/api/v1/tasks/${encodeURIComponent(taskId)}`, { method: "GET" });
    const status = task.output?.task_status;
    if (status === "SUCCEEDED") return task;
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(`Task ${status}: ${task.output?.message || task.output?.code || taskId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Task timed out: ${taskId}`);
}

async function handleImage(req: any, res: any) {
  const body = await readJson(req);
  const imageModel = body.model || model("AI_MODEL_IMAGE", "wan2.7-image-pro");
  const created = await dashscopeJson("/api/v1/services/aigc/image-generation/generation", {
    method: "POST",
    asyncTask: true,
    body: JSON.stringify({
      model: imageModel,
      input: { messages: [{ role: "user", content: [{ text: body.prompt }] }] },
      parameters: { size: "1328*1328", n: 1, watermark: false },
    }),
  });
  const taskId = created.output?.task_id;
  if (!taskId) throw new Error(`Image task returned no task_id: ${JSON.stringify(created)}`);
  const task = await pollTask(taskId, 110000);
  const imageUrl =
    task.output?.results?.[0]?.url ||
    task.output?.choices?.[0]?.message?.content?.find((item: any) => item.image)?.image;
  if (!imageUrl) throw new Error(`Image task returned no url: ${JSON.stringify(task)}`);

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Image fetch failed ${imgRes.status}`);
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/png";
  sendJson(res, 200, { url: `data:${contentType};base64,${bytes.toString("base64")}`, ossUrl: imageUrl });
}

async function handleTts(req: any, res: any) {
  const body = await readJson(req);
  const tts = await dashscopeJson("/api/v1/services/audio/tts/SpeechSynthesizer", {
    method: "POST",
    body: JSON.stringify({
      model: body.model || model("AI_MODEL_TTS", "cosyvoice-v3-flash"),
      input: { text: body.text, voice: body.voiceId, format: "mp3" },
    }),
  });
  const audioUrl = tts.output?.audio?.url;
  if (!audioUrl) throw new Error(`TTS returned no audio url: ${JSON.stringify(tts)}`);
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`TTS audio fetch failed ${audioRes.status}`);
  res.writeHead(200, {
    "content-type": audioRes.headers.get("content-type") || "audio/mpeg",
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  res.end(Buffer.from(await audioRes.arrayBuffer()));
}

async function handle3dCreate(req: any, res: any) {
  const body = await readJson(req);
  const created = await dashscopeJson("/api/v1/services/aigc/video-generation/3d-generation", {
    method: "POST",
    asyncTask: true,
    body: JSON.stringify({
      model: `Tripo/${body.model || model("AI_MODEL_3D", "Tripo-P1.0")}`,
      input: { image: body.imageUrl },
      parameters: { texture_quality: "standard" },
    }),
  });
  const taskId = created.output?.task_id;
  if (!taskId) throw new Error(`3D task returned no task_id: ${JSON.stringify(created)}`);
  sendJson(res, 200, { taskId });
}

async function handle3dPoll(path: string, res: any) {
  const taskId = decodeURIComponent(path.split("/").pop() || "");
  const task = await dashscopeJson(`/api/v1/tasks/${encodeURIComponent(taskId)}`, { method: "GET" });
  const status = task.output?.task_status || "UNKNOWN";
  const result = task.output?.results?.[0];
  sendJson(res, 200, {
    status,
    glbUrl: result?.pbr_model_url,
    previewUrl: result?.rendered_image_url,
  });
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});
  const path = routePath(req);
  try {
    if (path === "/api/health" || path === "/health") return sendJson(res, 200, { ok: true });
    if (req.method === "POST" && path === "/api/ai/stream") return await handleStream(req, res);
    if (req.method === "POST" && path === "/api/ai/image") return await handleImage(req, res);
    if (req.method === "POST" && path === "/api/ai/tts") return await handleTts(req, res);
    if (req.method === "POST" && path === "/api/ai/3d") return await handle3dCreate(req, res);
    if (req.method === "GET" && path.startsWith("/api/ai/3d/")) return await handle3dPoll(path, res);
    if (path === "/api/ai/asr") return sendJson(res, 501, { error: "ASR is not available on the Vercel function backend." });
    if (path === "/api/ai/realtime") return sendJson(res, 501, { error: "Realtime WebSocket requires the Bun backend." });
    return sendJson(res, 404, { error: "not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "server error";
    return sendJson(res, 500, { error: message });
  }
}

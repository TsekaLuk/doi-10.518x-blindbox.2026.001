const req = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${key} (see .env.example)`);
  return v;
};

export const env = {
  port: Number(process.env.PORT ?? 8787),
  ai: {
    // Compatible-mode endpoint: chat + vision only (supports enable_thinking/thinking_budget).
    baseUrl: req("AI_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    apiKey: process.env.AI_API_KEY ?? "",
    // Image/TTS/3D go through the `bl` CLI subprocess (see ai/upstream.ts) rather than
    // hand-rolled DashScope native async-task calls — `bl` already owns auth/polling/retries.
    models: {
      default: req("AI_MODEL_DEFAULT", "qwen3.7-plus"),
      vision: req("AI_MODEL_VISION", "qwen-vl-max"),
      image: req("AI_MODEL_IMAGE", "qwen-image-2.0"),
      fast: req("AI_MODEL_FAST", "qwen3.6-flash"),
      tts: req("AI_MODEL_TTS", "cosyvoice-v3-flash"),
      realtime: req("AI_MODEL_REALTIME", "qwen3.5-omni-plus-realtime"),
      threeD: req("AI_MODEL_3D", "Tripo-P1.0"),
    },
  },
  /** From `bl workspace list` (console auth). Empty disables the realtime voice feature. */
  bailianWorkspaceId: process.env.BAILIAN_WORKSPACE_ID ?? "",
};

/** Map logical model ids (what the client speaks) to concrete provider models. */
export function resolveModel(logical: string | undefined): string {
  const m = env.ai.models;
  switch (logical) {
    case undefined:
    case "default":
      return m.default;
    case "vision":
      return m.vision;
    case "image":
      return m.image;
    case "fast":
      return m.fast;
    default:
      return logical; // explicit concrete model name passes through
  }
}

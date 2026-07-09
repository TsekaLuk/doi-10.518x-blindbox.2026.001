/** API surface shared between web and server. Single source of truth for routes. */
export const API_ROUTES = {
  trpc: "/trpc",
  aiStream: "/api/ai/stream",
  aiImage: "/api/ai/image",
  aiTts: "/api/ai/tts",
  aiRealtime: "/api/ai/realtime",
  ai3d: "/api/ai/3d",
  health: "/health",
} as const;

/** SSE event names on the AI stream. */
export const SSE_EVENTS = {
  delta: "delta",
  done: "done",
  error: "error",
} as const;

export interface SseDelta {
  text: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

export * from "./persona";

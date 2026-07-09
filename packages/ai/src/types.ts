import type { SceneGraph, Timeline } from "@vibe/scene";
import type { ChatMessage, Persona } from "@vibe/shared";

/**
 * AIService — the interface-isolation seam.
 * MVP: one fetch-based implementation talking to the thin Hono proxy.
 * Post-hackathon: a ModelRouter implementation can dispatch per-call to
 * different models/providers (by complexity, cost, latency) without any
 * change to callers.
 */
export interface AIService {
  /** One-shot chat completion. */
  chat(messages: ChatMessage[], opts?: CallOptions): Promise<string>;

  /** Streaming chat; yields text deltas as they arrive (SSE under the hood). */
  chatStream(messages: ChatMessage[], opts?: CallOptions): AsyncIterable<string>;

  /** Vision: describe / analyze an image (URL or data URI). */
  vision(prompt: string, imageUrl: string, opts?: CallOptions): Promise<string>;

  /** Natural language -> validated SceneGraph JSON. */
  generateSceneGraph(prompt: string, opts?: CallOptions): Promise<SceneGraph>;

  /** Natural language -> validated Timeline JSON for an existing scene. */
  generateTimeline(prompt: string, scene: SceneGraph, opts?: CallOptions): Promise<Timeline>;

  /** Image generation (default model: qwen-image-2.0). Returns image URL/data URI. */
  generateImage(prompt: string, opts?: CallOptions & { style?: "qwen" | "wan" }): Promise<string>;

  /** 人格盲盒: freeform user input -> a brand-new, validated Persona. */
  generatePersona(prompt: string, opts?: CallOptions): Promise<Persona>;

  /** Text-to-speech; returns a playable audio URL (object URL / data URI). */
  synthesizeSpeech(text: string, voiceId: string, opts?: CallOptions): Promise<string>;
}

export interface CallOptions {
  /** Explicit model override; otherwise the router/default decides. */
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
  /** qwen3.x/qwq thinking mode — deeper reasoning before the final answer. */
  enableThinking?: boolean;
  thinkingBudget?: number;
  /** Reserved: streaming structured output — partial-JSON callbacks. */
  onPartial?: (partialJson: unknown) => void;
}

/* ------------------------------------------------------------------ */
/* Reserved interfaces — implement post-hackathon, callers stay stable. */
/* ------------------------------------------------------------------ */

/** Multi-model routing: pick a model per task complexity/cost. */
export interface ModelRouter {
  route(task: "chat" | "vision" | "scene" | "image" | "fast", hint?: { complexity?: "low" | "mid" | "high" }): string;
}

/** Embedding + RAG over the user's asset library. */
export interface EmbeddingService {
  embed(texts: string[]): Promise<number[][]>;
  search(query: string, topK?: number): Promise<Array<{ id: string; score: number }>>;
}

/** Local small-model hooks (Whisper ASR / local SD), same call shape. */
export interface LocalModelService {
  transcribe?(audio: Blob): Promise<string>;
}

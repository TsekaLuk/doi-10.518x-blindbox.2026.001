import { createHttpAIService } from "@vibe/ai";
import { API_ROUTES } from "@vibe/shared";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../../../server/src/routers";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

/**
 * The single AIService instance the UI talks to. Post-hackathon: replace
 * createHttpAIService with a router-backed implementation — callers unchanged.
 */
export const ai = createHttpAIService({ baseUrl });

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${baseUrl}${API_ROUTES.trpc}` })],
});

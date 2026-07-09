import type { ModelRouter } from "./types";

/**
 * Model registry. Names are resolved server-side against AI_MODEL_* env vars;
 * these logical ids are what the frontend and router speak. Concrete Bailian
 * model ids live only in apps/server/src/env.ts (never shipped to the client).
 */
export const MODELS = {
  default: "default",
  vision: "vision",
  image: "image",
  fast: "fast",
} as const;

/**
 * MVP router: static mapping. Post-hackathon: score prompt complexity and
 * dispatch to cheaper/faster models — same interface, swap the instance.
 */
export function createStaticRouter(): ModelRouter {
  return {
    route(task) {
      switch (task) {
        case "vision":
          return MODELS.vision;
        case "image":
          return MODELS.image;
        case "fast":
          return MODELS.fast;
        default:
          return MODELS.default;
      }
    },
  };
}

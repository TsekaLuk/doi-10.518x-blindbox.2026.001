import { SceneGraphSchema, TimelineSchema } from "@vibe/scene";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";

/**
 * tRPC = typed request/response RPC. Token streaming stays on the raw SSE
 * route (/api/ai/stream); tRPC covers everything with a discrete result.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, ts: 0 })),

  /** Validate a scene graph document (used before import/share). */
  scene: router({
    validate: publicProcedure
      .input(z.object({ scene: z.unknown() }))
      .mutation(({ input }) => {
        const parsed = SceneGraphSchema.safeParse(input.scene);
        return parsed.success
          ? { valid: true as const }
          : { valid: false as const, issues: parsed.error.issues };
      }),
    // Reserved: save / list / load — arrive with the DB in week 1-2.
  }),

  timeline: router({
    validate: publicProcedure
      .input(z.object({ timeline: z.unknown() }))
      .mutation(({ input }) => {
        const parsed = TimelineSchema.safeParse(input.timeline);
        return parsed.success
          ? { valid: true as const }
          : { valid: false as const, issues: parsed.error.issues };
      }),
  }),
});

export type AppRouter = typeof appRouter;

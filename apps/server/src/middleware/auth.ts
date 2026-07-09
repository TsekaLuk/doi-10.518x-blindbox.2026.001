import type { MiddlewareHandler } from "hono";

/**
 * Reserved: auth middleware (Clerk/Lucia post-hackathon).
 * MVP: pass-through that stamps an anonymous user. Routes never change —
 * swapping this middleware is the entire auth rollout.
 */
export interface AuthedUser {
  id: string;
  anonymous: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthedUser;
  }
}

export const auth: MiddlewareHandler = async (c, next) => {
  c.set("user", { id: "anon", anonymous: true });
  await next();
};

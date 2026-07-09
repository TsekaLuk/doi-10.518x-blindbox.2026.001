import { initTRPC } from "@trpc/server";
import type { AuthedUser } from "./middleware/auth";

export interface TrpcContext {
  user: AuthedUser;
  // Reserved: db (SQLite -> Postgres), queue (BullMQ) get added here.
}

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
/** Reserved: swap to a real auth check when Clerk/Lucia lands. */
export const protectedProcedure = t.procedure;

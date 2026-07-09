import type { AuthedUser } from "./middleware/auth";
export interface TrpcContext {
    user: AuthedUser;
}
export declare const router: import("@trpc/server").TRPCRouterBuilder<{
    ctx: TrpcContext;
    meta: object;
    errorShape: import("@trpc/server").TRPCDefaultErrorShape;
    transformer: false;
}>;
export declare const publicProcedure: import("@trpc/server").TRPCProcedureBuilder<TrpcContext, object, object, import("@trpc/server").TRPCUnsetMarker, import("@trpc/server").TRPCUnsetMarker, import("@trpc/server").TRPCUnsetMarker, import("@trpc/server").TRPCUnsetMarker, false>;
/** Reserved: swap to a real auth check when Clerk/Lucia lands. */
export declare const protectedProcedure: import("@trpc/server").TRPCProcedureBuilder<TrpcContext, object, object, import("@trpc/server").TRPCUnsetMarker, import("@trpc/server").TRPCUnsetMarker, import("@trpc/server").TRPCUnsetMarker, import("@trpc/server").TRPCUnsetMarker, false>;

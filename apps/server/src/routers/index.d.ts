import { z } from "zod";
/**
 * tRPC = typed request/response RPC. Token streaming stays on the raw SSE
 * route (/api/ai/stream); tRPC covers everything with a discrete result.
 */
export declare const appRouter: import("@trpc/server").TRPCBuiltRouter<{
    ctx: import("../trpc").TrpcContext;
    meta: object;
    errorShape: import("@trpc/server").TRPCDefaultErrorShape;
    transformer: false;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    health: import("@trpc/server").TRPCQueryProcedure<{
        input: void;
        output: {
            ok: boolean;
            ts: number;
        };
        meta: object;
    }>;
    /** Validate a scene graph document (used before import/share). */
    scene: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../trpc").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: false;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        validate: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                scene: unknown;
            };
            output: {
                valid: true;
                issues?: undefined;
            } | {
                valid: false;
                issues: z.core.$ZodIssue[];
            };
            meta: object;
        }>;
    }>>;
    timeline: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../trpc").TrpcContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: false;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        validate: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                timeline: unknown;
            };
            output: {
                valid: true;
                issues?: undefined;
            } | {
                valid: false;
                issues: z.core.$ZodIssue[];
            };
            meta: object;
        }>;
    }>>;
}>>;
export type AppRouter = typeof appRouter;

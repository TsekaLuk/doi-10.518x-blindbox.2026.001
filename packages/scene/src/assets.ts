import { z } from "zod";

/**
 * Asset Pipeline (MVP: in-memory URL registry).
 * Reserved hooks: persistence (DB), CDN distribution, streaming/LOD — all of
 * which only change how an assetId resolves, not how scenes reference assets.
 */

export const AssetSchema = z.object({
  id: z.string(),
  kind: z.enum(["gltf", "texture", "hdri", "audio", "image"]),
  /** MVP: direct URL or data URI. Later: resolved through CDN by id. */
  url: z.string(),
  name: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type Asset = z.infer<typeof AssetSchema>;

export interface AssetResolver {
  resolve(assetId: string): Promise<Asset | undefined>;
  register(asset: Asset): void;
}

/** MVP resolver — swap for a CDN/DB-backed one post-hackathon. */
export function createMemoryAssetResolver(): AssetResolver {
  const store = new Map<string, Asset>();
  return {
    async resolve(id) {
      return store.get(id);
    },
    register(asset) {
      store.set(asset.id, asset);
    },
  };
}

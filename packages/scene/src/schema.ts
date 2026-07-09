import { z } from "zod";

/**
 * Scene Graph = declarative JSON. Three.js is only a renderer of this data.
 * Everything the AI generates, the timeline animates, and (later) collaborators
 * sync over Yjs is expressed against this schema — never against Three objects.
 */

export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

export const TransformSchema = z.object({
  position: Vec3.default([0, 0, 0]),
  rotation: Vec3.default([0, 0, 0]),
  scale: Vec3.default([1, 1, 1]),
});

export const GeometrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("box"), size: Vec3.default([1, 1, 1]) }),
  z.object({ kind: z.literal("sphere"), radius: z.number().default(1) }),
  z.object({ kind: z.literal("plane"), width: z.number().default(1), height: z.number().default(1) }),
  z.object({
    kind: z.literal("torusKnot"),
    radius: z.number().default(1),
    tube: z.number().default(0.3),
  }),
  z.object({ kind: z.literal("cylinder"), radiusTop: z.number().default(1), radiusBottom: z.number().default(1), height: z.number().default(1) }),
  // Reserved: external assets flow through the Asset Pipeline (see assets.ts).
  z.object({ kind: z.literal("gltf"), assetId: z.string() }),
  z.object({ kind: z.literal("text"), text: z.string(), size: z.number().default(1) }),
]);
export type Geometry = z.infer<typeof GeometrySchema>;

export const MaterialSchema = z.object({
  kind: z.enum(["standard", "physical", "basic", "shader"]).default("standard"),
  color: z.string().default("#ffffff"),
  metalness: z.number().min(0).max(1).default(0.2),
  roughness: z.number().min(0).max(1).default(0.4),
  emissive: z.string().optional(),
  opacity: z.number().min(0).max(1).default(1),
  wireframe: z.boolean().default(false),
  /** kind === "shader": id into the shader registry (apps/web/src/scene/shaders). */
  shaderId: z.string().optional(),
  /** Serializable uniforms for shader materials. */
  uniforms: z.record(z.string(), z.union([z.number(), Vec3, z.string()])).optional(),
});
export type Material = z.infer<typeof MaterialSchema>;

export const LightSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ambient"), intensity: z.number().default(0.5), color: z.string().default("#ffffff") }),
  z.object({ kind: z.literal("directional"), intensity: z.number().default(1), color: z.string().default("#ffffff") }),
  z.object({ kind: z.literal("point"), intensity: z.number().default(1), color: z.string().default("#ffffff"), distance: z.number().default(0) }),
]);

interface SceneNodeBase {
  id: string;
  name?: string;
  type: "mesh" | "group" | "light";
  transform?: z.infer<typeof TransformSchema>;
  geometry?: Geometry;
  material?: Material;
  light?: z.infer<typeof LightSchema>;
  visible?: boolean;
  children?: SceneNodeBase[];
}

export const SceneNodeSchema: z.ZodType<SceneNodeBase> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.enum(["mesh", "group", "light"]),
    transform: TransformSchema.optional(),
    geometry: GeometrySchema.optional(),
    material: MaterialSchema.optional(),
    light: LightSchema.optional(),
    visible: z.boolean().optional(),
    children: z.array(SceneNodeSchema).optional(),
  }),
) as z.ZodType<SceneNodeBase>;
export type SceneNode = SceneNodeBase;

export const EnvironmentSchema = z.object({
  background: z.string().default("#0a0a0f"),
  fog: z.object({ color: z.string(), near: z.number(), far: z.number() }).optional(),
  environmentPreset: z.string().optional(),
});

export const CameraSchema = z.object({
  position: Vec3.default([0, 1.5, 6]),
  lookAt: Vec3.default([0, 0, 0]),
  fov: z.number().default(50),
});

export const SceneGraphSchema = z.object({
  /** Bump when the schema breaks; renderers can migrate old documents. */
  version: z.literal(1).default(1),
  id: z.string(),
  name: z.string().default("Untitled"),
  environment: EnvironmentSchema.default({ background: "#0a0a0f" }),
  camera: CameraSchema.default({ position: [0, 1.5, 6], lookAt: [0, 0, 0], fov: 50 }),
  nodes: z.array(SceneNodeSchema).default([]),
});
export type SceneGraph = z.infer<typeof SceneGraphSchema>;

export function parseSceneGraph(json: unknown): SceneGraph {
  return SceneGraphSchema.parse(json);
}

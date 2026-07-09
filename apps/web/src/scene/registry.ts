import * as THREE from "three";
import type { SceneNode } from "@vibe/scene";

/**
 * Node registry: SceneNode id -> live Object3D.
 * The Timeline Compiler animates through this indirection, so GSAP never
 * holds direct references baked at compile time into JSX.
 */
export const nodeRegistry = new Map<string, THREE.Object3D>();

export function registerNode(node: SceneNode, obj: THREE.Object3D | null) {
  if (obj) nodeRegistry.set(node.id, obj);
  else nodeRegistry.delete(node.id);
}

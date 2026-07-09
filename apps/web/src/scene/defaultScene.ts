import type { SceneGraph, Timeline } from "@vibe/scene";

/** Demo document shown before the first AI generation. */
export const defaultScene: SceneGraph = {
  version: 1,
  id: "default",
  name: "Hello Vibe",
  environment: { background: "#0e100f" },
  camera: { position: [0, 1.2, 6], lookAt: [0, 0, 0], fov: 50 },
  nodes: [
    { id: "ambient", type: "light", light: { kind: "ambient", intensity: 0.4, color: "#fffce1" } },
    {
      id: "key",
      type: "light",
      transform: { position: [4, 6, 4], rotation: [0, 0, 0], scale: [1, 1, 1] },
      light: { kind: "directional", intensity: 1.4, color: "#fffce1" },
    },
    {
      id: "hero-knot",
      type: "mesh",
      transform: { position: [0, 0.4, 0], rotation: [0.4, 0, 0], scale: [1, 1, 1] },
      geometry: { kind: "torusKnot", radius: 1.2, tube: 0.32 },
      material: { kind: "physical", color: "#0ae448", metalness: 0.7, roughness: 0.25, opacity: 1, wireframe: false },
    },
    {
      id: "floor",
      type: "mesh",
      transform: { position: [0, -1.4, 0], rotation: [-1.5708, 0, 0], scale: [1, 1, 1] },
      geometry: { kind: "plane", width: 40, height: 40 },
      material: { kind: "standard", color: "#141613", metalness: 0.1, roughness: 0.9, opacity: 1, wireframe: false },
    },
  ],
};

export const defaultTimeline: Timeline = {
  version: 1,
  id: "default-timeline",
  duration: 6,
  repeat: -1,
  tracks: [
    {
      targetId: "hero-knot",
      keyframes: [
        { time: 0, property: "rotation.y", value: 0, ease: "none" },
        { time: 6, property: "rotation.y", value: 6.2832, ease: "none" },
      ],
    },
  ],
};

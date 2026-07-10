import type { SceneGraph, Timeline } from "@vibe/scene";

/**
 * Idle-state scene before the user pulls their first persona: EMPTY and
 * transparent. The living mesh-gradient background is pure CSS (App.tsx's
 * .mesh-bg layer) — a WebGL background shader shimmered on some GPUs
 * (mediump precision), so the canvas is now a transparent overlay reserved
 * for the blind-box burst only.
 */
export const defaultScene: SceneGraph = {
  version: 1,
  id: "default",
  name: "人格盲盒",
  environment: { background: "transparent" },
  camera: { position: [0, 1.2, 6], lookAt: [0, 0, 0], fov: 50 },
  nodes: [
    { id: "ambient", type: "light", light: { kind: "ambient", intensity: 0.4, color: "#fffce1" } },
  ],
};

export const defaultTimeline: Timeline = {
  version: 1,
  id: "default-timeline",
  duration: 1,
  repeat: 0,
  tracks: [],
};

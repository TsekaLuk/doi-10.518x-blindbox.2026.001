import type { SceneGraph, Timeline } from "@vibe/scene";
import { parseSceneGraph, parseTimeline } from "@vibe/scene";
import { create } from "zustand";
import { defaultScene, defaultTimeline } from "../scene/defaultScene";

/**
 * App store. Design constraint: everything under `doc` must stay
 * JSON-serializable — dump/hydrate below are the seam for IndexedDB
 * persistence (offline) and Yjs sync (collaboration) post-hackathon.
 */
export interface VibeDoc {
  scene: SceneGraph;
  timeline: Timeline;
}

interface VibeState {
  doc: VibeDoc;
  generating: boolean;
  error?: string;

  setScene(scene: SceneGraph): void;
  setTimeline(timeline: Timeline): void;
  setGenerating(v: boolean): void;
  setError(msg?: string): void;

  /** Serialize the whole document — IndexedDB / share links / export. */
  dump(): string;
  /** Hydrate from a serialized document (validates against schemas). */
  hydrate(json: string): void;
}

export const useVibeStore = create<VibeState>((set, get) => ({
  doc: { scene: defaultScene, timeline: defaultTimeline },
  generating: false,

  setScene: (scene) => set((s) => ({ doc: { ...s.doc, scene } })),
  setTimeline: (timeline) => set((s) => ({ doc: { ...s.doc, timeline } })),
  setGenerating: (generating) => set({ generating }),
  setError: (error) => set({ error }),

  dump: () => JSON.stringify(get().doc),
  hydrate: (json) => {
    const raw = JSON.parse(json) as { scene: unknown; timeline: unknown };
    set({
      doc: {
        scene: parseSceneGraph(raw.scene),
        timeline: parseTimeline(raw.timeline),
      },
    });
  },
}));

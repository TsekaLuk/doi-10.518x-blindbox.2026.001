import { describe, expect, it } from "bun:test";
import { createMemoryAssetResolver, parseSceneGraph, parseTimeline } from "../packages/scene/src";

describe("scene graph schema", () => {
  it("applies defaults to a minimal valid scene", () => {
    const scene = parseSceneGraph({
      id: "scene-1",
      nodes: [
        {
          id: "hero-cube",
          type: "mesh",
          geometry: { kind: "box" },
          material: { color: "#ff5a1f" },
        },
      ],
    });

    expect(scene.version).toBe(1);
    expect(scene.name).toBe("Untitled");
    expect(scene.camera.position).toEqual([0, 1.5, 6]);
    expect(scene.environment.background).toBe("#0a0a0f");

    const node = scene.nodes[0];
    if (node?.geometry?.kind !== "box") throw new Error("expected box geometry");

    expect(node.geometry.size).toEqual([1, 1, 1]);
    expect(node.material?.kind).toBe("standard");
    expect(node.material?.roughness).toBe(0.4);
  });

  it("rejects invalid material ranges", () => {
    expect(() =>
      parseSceneGraph({
        id: "scene-1",
        nodes: [
          {
            id: "bad-material",
            type: "mesh",
            geometry: { kind: "sphere" },
            material: { opacity: 2 },
          },
        ],
      }),
    ).toThrow();
  });
});

describe("timeline schema", () => {
  it("applies timeline and keyframe defaults", () => {
    const timeline = parseTimeline({
      id: "intro",
      tracks: [
        {
          targetId: "hero-cube",
          keyframes: [{ time: 0, property: "transform.rotation.1", value: 0 }],
        },
      ],
    });

    expect(timeline.version).toBe(1);
    expect(timeline.duration).toBe(5);
    expect(timeline.repeat).toBe(0);
    expect(timeline.tracks[0]?.keyframes[0]?.ease).toBe("power2.inOut");
  });
});

describe("memory asset resolver", () => {
  it("registers and resolves assets by id", async () => {
    const resolver = createMemoryAssetResolver();
    resolver.register({ id: "hero-texture", kind: "texture", url: "/assets/hero.png" });

    await expect(resolver.resolve("hero-texture")).resolves.toEqual({
      id: "hero-texture",
      kind: "texture",
      url: "/assets/hero.png",
    });
    await expect(resolver.resolve("missing")).resolves.toBeUndefined();
  });
});

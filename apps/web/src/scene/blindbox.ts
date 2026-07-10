import type { SceneGraph, SceneNode, Timeline } from "@vibe/scene";

/**
 * Blind Box Opening — hand-authored (deterministic) 3D spectacle.
 *
 * A glossy box shakes with anticipation, cracks, and bursts into shards that
 * fly outward while fading, revealing the moment where the 2D portrait card
 * is composited on top via HTML (not part of this scene).
 *
 * Kept deterministic (no Math.random) so the choreography is reproducible
 * and easy to reason about/debug; only the palette varies per persona.
 *
 * GOTCHA: SceneRenderer sets three.js `transparent: material.opacity < 1`
 * ONCE at mount from the initial JSON. Every node whose timeline animates
 * material.opacity toward 0 has its initial opacity set to 0.999 (not 1)
 * below so the fade actually renders.
 */

const SHARD_COUNT = 16;

export function buildBlindBoxDocument(palette: [string, string, string]): {
  scene: SceneGraph;
  timeline: Timeline;
} {
  const [colorA, colorB, colorC] = palette;
  const shardColors = [colorA, colorB, colorC];

  /**
   * Procedural gift box: body + fitted lid + crossing ribbons + a sphere bow,
   * all children of "box-core" so the existing shake/burst keyframes animate
   * the whole gift as one object. No emissive — full-strength emissive was
   * what flattened the old cube into an unshaded color square.
   *
   * Children inherit the parent mesh's transforms, but material.opacity does
   * NOT cascade — each part gets its own fade track in the timeline below.
   */
  const giftPart = (
    id: string,
    color: string,
    geometry: SceneNode["geometry"],
    position: [number, number, number],
    opts?: { metalness?: number; roughness?: number },
  ): SceneNode => ({
    id,
    type: "mesh",
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    geometry,
    material: {
      kind: "physical",
      color,
      metalness: opts?.metalness ?? 0.15,
      roughness: opts?.roughness ?? 0.45,
      opacity: 0.999,
      wireframe: false,
    },
  });

  const GIFT_PART_IDS = ["box-lid", "ribbon-x", "ribbon-z", "bow-left", "bow-right", "bow-knot"];

  const boxCore: SceneNode = {
    id: "box-core",
    type: "mesh",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    // Body: slightly squat cube, glossy plastic.
    geometry: { kind: "box", size: [1.15, 0.95, 1.15] },
    material: {
      kind: "physical",
      color: colorA,
      metalness: 0.25,
      roughness: 0.3,
      opacity: 0.999,
      wireframe: false,
    },
    children: [
      // Fitted lid, slightly proud of the body.
      giftPart("box-lid", colorB, { kind: "box", size: [1.28, 0.26, 1.28] }, [0, 0.55, 0], {
        metalness: 0.25,
        roughness: 0.3,
      }),
      // Ribbons crossing body + lid, proud on every side.
      giftPart("ribbon-x", colorC, { kind: "box", size: [1.32, 1.34, 0.18] }, [0, 0.05, 0]),
      giftPart("ribbon-z", colorC, { kind: "box", size: [0.18, 1.34, 1.32] }, [0, 0.05, 0]),
      // Bow: two lobes + a center knot on the lid.
      giftPart("bow-left", colorC, { kind: "sphere", radius: 0.17 }, [-0.17, 0.79, 0]),
      giftPart("bow-right", colorC, { kind: "sphere", radius: 0.17 }, [0.17, 0.79, 0]),
      giftPart("bow-knot", colorB, { kind: "sphere", radius: 0.11 }, [0, 0.79, 0]),
    ],
  };

  const shardNodes: SceneNode[] = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    // Deterministic per-shard jitter derived purely from index (no Math.random).
    const jitter = ((i * 37) % 11) / 110; // 0..~0.1
    const radius = 0.08 + ((i * 13) % 11) / 100; // 0.08..~0.19
    shardNodes.push({
      id: `shard-${i}`,
      type: "mesh",
      transform: {
        position: [jitter, jitter * 0.5, -jitter],
        rotation: [0, 0, 0],
        scale: [0.01, 0.01, 0.01],
      },
      geometry: { kind: "sphere", radius },
      material: {
        kind: "physical",
        color: shardColors[i % shardColors.length]!,
        metalness: 0.7,
        roughness: 0.2,
        opacity: 0.999,
        wireframe: false,
      },
    });
  }

  const scene: SceneGraph = {
    version: 1,
    id: "blindbox",
    name: "Blind Box Opening",
    // Transparent: the burst plays over the CSS mesh-gradient page background.
    environment: { background: "transparent" },
    camera: { position: [0, 1.2, 6], lookAt: [0, 0, 0], fov: 50 },
    nodes: [
      // Lower ambient + angled key + cool fill: on the light page background
      // the gift needs visible form/shading, not a flat wash.
      { id: "ambient", type: "light", light: { kind: "ambient", intensity: 0.55, color: "#ffffff" } },
      {
        id: "key",
        type: "light",
        transform: { position: [4, 6, 4], rotation: [0, 0, 0], scale: [1, 1, 1] },
        light: { kind: "directional", intensity: 1.9, color: "#fffce1" },
      },
      {
        id: "fill",
        type: "light",
        transform: { position: [-5, 2.5, -3], rotation: [0, 0, 0], scale: [1, 1, 1] },
        light: { kind: "directional", intensity: 0.7, color: "#eef2ff" },
      },
      {
        id: "accent-point",
        type: "light",
        transform: { position: [0, 1.5, 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
        light: { kind: "point", intensity: 1.0, color: colorA, distance: 12 },
      },
      boxCore,
      ...shardNodes,
    ],
  };

  const timeline: Timeline = {
    version: 1,
    id: "blindbox-timeline",
    duration: 3.0,
    repeat: 0,
    tracks: [
      // Phase 1: anticipation shake — rotation.z oscillation + subtle scale pulse.
      {
        targetId: "box-core",
        keyframes: [
          { time: 0.0, property: "rotation.z", value: 0, ease: "power1.inOut" },
          { time: 0.18, property: "rotation.z", value: 0.06, ease: "power1.inOut" },
          { time: 0.36, property: "rotation.z", value: -0.06, ease: "power1.inOut" },
          { time: 0.54, property: "rotation.z", value: 0.08, ease: "power1.inOut" },
          { time: 0.72, property: "rotation.z", value: -0.08, ease: "power1.inOut" },
          { time: 0.9, property: "rotation.z", value: 0.05, ease: "power1.inOut" },
          { time: 1.1, property: "rotation.z", value: 0, ease: "power1.inOut" },

          { time: 0.0, property: "scale.x", value: 1.0, ease: "power1.inOut" },
          { time: 0.2, property: "scale.x", value: 1.04, ease: "power1.inOut" },
          { time: 0.4, property: "scale.x", value: 1.0, ease: "power1.inOut" },
          { time: 0.6, property: "scale.x", value: 1.04, ease: "power1.inOut" },
          { time: 0.8, property: "scale.x", value: 1.0, ease: "power1.inOut" },
          { time: 1.0, property: "scale.x", value: 1.02, ease: "power1.inOut" },
          { time: 1.1, property: "scale.x", value: 1.0, ease: "power1.inOut" },

          { time: 0.0, property: "scale.y", value: 1.0, ease: "power1.inOut" },
          { time: 0.2, property: "scale.y", value: 1.04, ease: "power1.inOut" },
          { time: 0.4, property: "scale.y", value: 1.0, ease: "power1.inOut" },
          { time: 0.6, property: "scale.y", value: 1.04, ease: "power1.inOut" },
          { time: 0.8, property: "scale.y", value: 1.0, ease: "power1.inOut" },
          { time: 1.0, property: "scale.y", value: 1.02, ease: "power1.inOut" },
          { time: 1.1, property: "scale.y", value: 1.0, ease: "power1.inOut" },

          { time: 0.0, property: "scale.z", value: 1.0, ease: "power1.inOut" },
          { time: 0.2, property: "scale.z", value: 1.04, ease: "power1.inOut" },
          { time: 0.4, property: "scale.z", value: 1.0, ease: "power1.inOut" },
          { time: 0.6, property: "scale.z", value: 1.04, ease: "power1.inOut" },
          { time: 0.8, property: "scale.z", value: 1.0, ease: "power1.inOut" },
          { time: 1.0, property: "scale.z", value: 1.02, ease: "power1.inOut" },
          { time: 1.1, property: "scale.z", value: 1.0, ease: "power1.inOut" },

          // Phase 2: burst — rapid scale-up then fade out.
          { time: 1.25, property: "scale.x", value: 1.6, ease: "power4.out" },
          { time: 1.25, property: "scale.y", value: 1.6, ease: "power4.out" },
          { time: 1.25, property: "scale.z", value: 1.6, ease: "power4.out" },

          { time: 1.1, property: "material.opacity", value: 0.999, ease: "power2.in" },
          { time: 1.55, property: "material.opacity", value: 0, ease: "power2.in" },
        ],
      },
      // The gift's child parts (lid/ribbons/bow) inherit the parent's shake and
      // burst scale, but opacity is per-material — mirror the body's fade.
      ...GIFT_PART_IDS.map((id): Timeline["tracks"][number] => ({
        targetId: id,
        keyframes: [
          { time: 1.1, property: "material.opacity", value: 0.999, ease: "power2.in" },
          { time: 1.55, property: "material.opacity", value: 0, ease: "power2.in" },
        ],
      })),
      ...shardNodes.map((shard, i): Timeline["tracks"][number] => {
        const angle = (i / SHARD_COUNT) * Math.PI * 2;
        // Deterministic pseudo-variation from index via trig + arithmetic (no Math.random).
        const radiusOut = 1.8 + ((i * 7) % 9) * 0.2; // ~1.8..3.4
        const heightOut = ((i % 5) - 2) * 0.5; // -1.0..1.0
        const finalScale = 0.06 + ((i * 5) % 10) * 0.009; // ~0.06..0.15
        const burstStart = 1.1 + (i % 4) * 0.02; // small stagger, still within window
        const flightDuration = 0.5 + (i % 5) * 0.08; // 0.5..0.82
        const flightEnd = burstStart + flightDuration;
        const fadeStart = Math.max(burstStart + 0.15, flightEnd - 0.4);

        const targetX = Math.cos(angle) * radiusOut;
        const targetY = Math.sin(angle * 0.7) * 1.2 + heightOut;
        const targetZ = Math.sin(angle) * radiusOut;

        return {
          targetId: shard.id,
          keyframes: [
            { time: burstStart, property: "scale.x", value: 0.01, ease: "back.out(2)" },
            { time: burstStart + 0.18, property: "scale.x", value: finalScale, ease: "back.out(2)" },
            { time: burstStart, property: "scale.y", value: 0.01, ease: "back.out(2)" },
            { time: burstStart + 0.18, property: "scale.y", value: finalScale, ease: "back.out(2)" },
            { time: burstStart, property: "scale.z", value: 0.01, ease: "back.out(2)" },
            { time: burstStart + 0.18, property: "scale.z", value: finalScale, ease: "back.out(2)" },

            { time: burstStart, property: "position.x", value: 0, ease: "power3.out" },
            { time: flightEnd, property: "position.x", value: targetX, ease: "power3.out" },
            { time: burstStart, property: "position.y", value: 0, ease: "power3.out" },
            { time: flightEnd, property: "position.y", value: targetY, ease: "power3.out" },
            { time: burstStart, property: "position.z", value: 0, ease: "power3.out" },
            { time: flightEnd, property: "position.z", value: targetZ, ease: "power3.out" },

            { time: fadeStart, property: "material.opacity", value: 0.999, ease: "power2.in" },
            { time: fadeStart + 0.4, property: "material.opacity", value: 0, ease: "power2.in" },
          ],
        };
      }),
    ],
  };

  return { scene, timeline };
}

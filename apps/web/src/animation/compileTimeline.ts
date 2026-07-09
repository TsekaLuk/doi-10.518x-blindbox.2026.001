import type { Timeline } from "@vibe/scene";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { nodeRegistry } from "../scene/registry";

gsap.registerPlugin(ScrollTrigger);

/**
 * Timeline Compiler: declarative Timeline JSON -> live GSAP timeline.
 * Runs against the node registry, so recompiling after a scene swap is just
 * kill() + compile again.
 */
export function compileTimeline(tl: Timeline): gsap.core.Timeline {
  const gtl = gsap.timeline({
    repeat: tl.repeat,
    scrollTrigger: tl.scroll
      ? {
          trigger: tl.scroll.trigger,
          start: tl.scroll.start,
          end: tl.scroll.end,
          scrub: tl.scroll.scrub,
          pin: tl.scroll.pin,
        }
      : undefined,
  });

  for (const track of tl.tracks) {
    const obj = nodeRegistry.get(track.targetId);
    if (!obj) continue;

    for (const kf of track.keyframes) {
      const target = resolveTarget(obj, kf.property);
      if (!target) continue;
      gtl.to(target.holder, { [target.key]: kf.value, ease: kf.ease, duration: 0 }, kf.time);
    }
  }

  // Convert stacked zero-duration tweens into interpolated segments:
  // GSAP handles same-property tweens at increasing times natively when we
  // give each segment its real duration — recompute from keyframe deltas.
  gtl.clear();
  for (const track of tl.tracks) {
    const obj = nodeRegistry.get(track.targetId);
    if (!obj) continue;
    const byProp = new Map<string, typeof track.keyframes>();
    for (const kf of track.keyframes) {
      const list = byProp.get(kf.property) ?? [];
      list.push(kf);
      byProp.set(kf.property, list);
    }
    for (const [prop, kfs] of byProp) {
      const sorted = [...kfs].sort((a, b) => a.time - b.time);
      const target = resolveTarget(obj, prop);
      if (!target) continue;
      let prev = sorted[0];
      if (!prev) continue;
      gtl.set(target.holder, { [target.key]: prev.value }, prev.time);
      for (const kf of sorted.slice(1)) {
        gtl.to(
          target.holder,
          { [target.key]: kf.value, ease: kf.ease, duration: kf.time - prev.time },
          prev.time,
        );
        prev = kf;
      }
    }
  }
  return gtl;
}

/** "rotation.y" -> { holder: obj.rotation, key: "y" }; "material.opacity" supported. */
function resolveTarget(
  obj: object,
  path: string,
): { holder: Record<string, unknown>; key: string } | undefined {
  const parts = path.split(".");
  let holder: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    holder = (holder as Record<string, unknown>)[parts[i] as string];
    if (holder == null) return undefined;
  }
  const key = parts[parts.length - 1];
  if (!key) return undefined;
  return { holder: holder as Record<string, unknown>, key };
}

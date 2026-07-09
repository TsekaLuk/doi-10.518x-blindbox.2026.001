import { z } from "zod";

/**
 * Timeline = declarative animation data, compiled to a GSAP timeline by the
 * web app's Timeline Compiler. Keeping it as JSON means the AI can generate
 * it, it can be versioned (undo/redo later), and exported (MP4 later).
 */

export const KeyframeSchema = z.object({
  /** Seconds from track start (or scroll progress 0-1 when scroll-driven). */
  time: z.number(),
  /** Dot-path on the target node, e.g. "transform.rotation.1" or "material.opacity". */
  property: z.string(),
  value: z.union([z.number(), z.string(), z.array(z.number())]),
  ease: z.string().default("power2.inOut"),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const TrackSchema = z.object({
  /** SceneNode id this track animates; "camera" targets the scene camera. */
  targetId: z.string(),
  keyframes: z.array(KeyframeSchema),
});

export const ScrollBindingSchema = z.object({
  /** CSS selector of the scroll section driving this timeline. */
  trigger: z.string(),
  start: z.string().default("top top"),
  end: z.string().default("bottom bottom"),
  scrub: z.union([z.boolean(), z.number()]).default(true),
  pin: z.boolean().default(false),
});

export const TimelineSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string(),
  duration: z.number().default(5),
  repeat: z.number().default(0),
  tracks: z.array(TrackSchema).default([]),
  /** When present the timeline is scroll-driven via ScrollTrigger. */
  scroll: ScrollBindingSchema.optional(),
});
export type Timeline = z.infer<typeof TimelineSchema>;

export function parseTimeline(json: unknown): Timeline {
  return TimelineSchema.parse(json);
}

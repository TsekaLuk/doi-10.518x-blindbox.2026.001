import { useGSAP } from "@gsap/react";
import type { Timeline } from "@vibe/scene";
import { compileTimeline } from "./compileTimeline";

/**
 * Animation Runtime hook: (re)compiles the declarative timeline whenever the
 * document changes. useGSAP scopes cleanup so hot swaps don't leak tweens.
 */
export function useTimeline(timeline: Timeline) {
  useGSAP(
    () => {
      // Defer one frame so R3F has mounted nodes into the registry.
      const id = requestAnimationFrame(() => {
        compileTimeline(timeline);
      });
      return () => cancelAnimationFrame(id);
    },
    { dependencies: [timeline] },
  );
}

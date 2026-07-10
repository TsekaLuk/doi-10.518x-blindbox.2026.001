import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import { PersonaFlow } from "./persona/PersonaFlow";
import { SceneRenderer } from "./scene/SceneRenderer";
import { useTimeline } from "./animation/useTimeline";
import { useVibeStore } from "./state/store";

/**
 * The page is an academic-paper-shaped document (hero = title, sections =
 * abstract/method/results/discussion, footer = references) scrolling over a
 * fixed CSS mesh-gradient background (pure CSS — a WebGL background shader
 * shimmered on some GPUs). The transparent 3D canvas above it hosts only the
 * blind-box burst.
 */
export default function App() {
  const doc = useVibeStore((s) => s.doc);
  useTimeline(doc.timeline);

  return (
    <Theme theme={neutralTheme} mode="light">
      <div className="relative min-h-full">
        <div className="mesh-bg" aria-hidden>
          <span className="mesh-bg-blob mesh-bg-blob--pink" />
          <span className="mesh-bg-blob mesh-bg-blob--lilac" />
          <span className="mesh-bg-blob mesh-bg-blob--blue" />
          <span className="mesh-bg-blob mesh-bg-blob--green" />
          <span className="mesh-bg-blob mesh-bg-blob--orange" />
        </div>
        <div className="fixed inset-0 z-0">
          <SceneRenderer scene={doc.scene} />
        </div>
        <PersonaFlow />
      </div>
    </Theme>
  );
}

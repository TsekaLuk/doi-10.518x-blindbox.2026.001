import { Text } from "@astryxdesign/core/Text";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import { PromptBar } from "./components/PromptBar";
import { SceneRenderer } from "./scene/SceneRenderer";
import { useTimeline } from "./animation/useTimeline";
import { useVibeStore } from "./state/store";

export default function App() {
  const doc = useVibeStore((s) => s.doc);
  useTimeline(doc.timeline);

  return (
    <Theme theme={neutralTheme} mode="dark">
      <div className="relative h-full">
        <div className="absolute inset-0">
          <SceneRenderer scene={doc.scene} />
        </div>

        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-8 py-6">
          <Text type="large" weight="semibold">
            vibe<span className="text-shockingly-green">.</span>
          </Text>
          <Text type="supporting" maxLines={1}>
            {doc.scene.name}
          </Text>
        </header>

        <PromptBar />
      </div>
    </Theme>
  );
}

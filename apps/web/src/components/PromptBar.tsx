import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";
import { ai } from "../ai/client";
import { useVibeStore } from "../state/store";

/** Natural language -> SceneGraph. The core AI-native loop of the demo. */
export function PromptBar() {
  const [prompt, setPrompt] = useState("");
  const { generating, setGenerating, setScene, setError, error } = useVibeStore();

  async function generate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(undefined);
    try {
      const scene = await ai.generateSceneGraph(prompt);
      setScene(scene);
    } catch (err) {
      setError(err instanceof Error ? err.message : "generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-8 mx-auto flex w-[min(760px,90vw)] flex-col gap-3">
      {error ? (
        <Banner
          status="error"
          title="Generation failed"
          description={error}
          container="card"
          isDismissable
          onDismiss={() => setError(undefined)}
        />
      ) : null}
      <div className="flex items-center gap-3 rounded-full border border-surface-25 bg-just-black/80 p-2 pl-4 backdrop-blur">
        <div className="min-w-0 flex-1">
          <TextInput
            label="Scene prompt"
            isLabelHidden
            value={prompt}
            onChange={setPrompt}
            onEnter={generate}
            isDisabled={generating}
            hasClear
            size="lg"
            width="100%"
            placeholder="Describe a scene... e.g. a neon-green torus orbited by glass spheres"
          />
        </div>
        <Button
          label="Generate"
          variant="primary"
          size="lg"
          clickAction={generate}
          isDisabled={!prompt.trim() || generating}
          isLoading={generating}
          tooltip={!prompt.trim() ? "Enter a scene prompt first" : undefined}
        >
          {generating ? "Generating" : "Generate"}
        </Button>
      </div>
    </div>
  );
}

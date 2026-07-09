import { describe, expect, it } from "bun:test";
import { extractDeltas } from "../apps/server/src/ai/upstream";

const encoder = new TextEncoder();

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of extractDeltas(stream)) out.push(delta);
  return out;
}

describe("extractDeltas", () => {
  it("parses OpenAI-compatible SSE deltas across chunk boundaries", async () => {
    const first = 'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n';
    const second = 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n';

    await expect(
      collect(streamFromChunks([first.slice(0, 17), first.slice(17), "data: {bad json}\n\n", second, "data: [DONE]\n\n"])),
    ).resolves.toEqual(["hel", "lo"]);
  });
});

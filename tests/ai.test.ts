import { describe, expect, it } from "bun:test";
import { createStaticRouter, MODELS } from "../packages/ai/src/models";
import { extractJson } from "../packages/ai/src/prompts";

describe("extractJson", () => {
  it("extracts a JSON object from fenced model output", () => {
    expect(extractJson('```json\n{"id":"scene-1","ok":true}\n```')).toEqual({
      id: "scene-1",
      ok: true,
    });
  });

  it("throws when the model output contains no JSON object", () => {
    expect(() => extractJson("plain prose only")).toThrow("No JSON object");
  });
});

describe("static model router", () => {
  it("routes known task classes to logical model ids", () => {
    const router = createStaticRouter();

    expect(router.route("chat")).toBe(MODELS.default);
    expect(router.route("scene")).toBe(MODELS.default);
    expect(router.route("vision")).toBe(MODELS.vision);
    expect(router.route("image")).toBe(MODELS.image);
    expect(router.route("fast")).toBe(MODELS.fast);
  });
});

import { describe, expect, it } from "bun:test";
import tokens from "../packages/design-system/tokens.json";

describe("design-system package", () => {
  it("keeps color tokens consumable from both CSS entry points", async () => {
    const [tailwindCss, variablesCss, astryxCss] = await Promise.all([
      Bun.file("packages/design-system/tailwind.css").text(),
      Bun.file("packages/design-system/variables.css").text(),
      Bun.file("packages/design-system/astryx.css").text(),
    ]);

    for (const colorName of Object.keys(tokens.color)) {
      expect(tailwindCss).toContain(`--color-${colorName}`);
      expect(variablesCss).toContain(`--vibe-color-${colorName}`);
    }

    expect(astryxCss).toContain("--color-background-body");
    expect(astryxCss).toContain("--color-text-primary");
    expect(astryxCss).toContain("--font-family-body");
  });

  it("does not shadow common Tailwind or Astryx runtime tokens from brand files", async () => {
    const [tailwindCss, variablesCss] = await Promise.all([
      Bun.file("packages/design-system/tailwind.css").text(),
      Bun.file("packages/design-system/variables.css").text(),
    ]);

    for (const collision of ["--spacing-8:", "--spacing-12:", "--radius-full:", "--radius-lg:"]) {
      expect(tailwindCss).not.toContain(collision);
      expect(variablesCss).not.toContain(collision);
    }
  });

  it("keeps Astryx and Tailwind CSS responsibilities separate", async () => {
    const [tailwindCss, astryxCss, variablesCss] = await Promise.all([
      Bun.file("packages/design-system/tailwind.css").text(),
      Bun.file("packages/design-system/astryx.css").text(),
      Bun.file("packages/design-system/variables.css").text(),
    ]);

    expect(tailwindCss).toContain("@theme");
    expect(tailwindCss).not.toContain("--color-background-body");
    expect(tailwindCss).not.toContain("--font-family-body");
    expect(tailwindCss).not.toContain("--radius-element");

    expect(astryxCss).not.toContain("@theme");
    expect(astryxCss).toContain("--color-background-body");
    expect(astryxCss).toContain("--font-family-body");
    expect(astryxCss).toContain("--radius-element");

    expect(variablesCss).not.toContain("@theme");
    expect(variablesCss).not.toContain("--color-background-body");
    expect(variablesCss).not.toContain("--font-family-body");
  });

  it("keeps the expected consumption artifacts in the package", async () => {
    await expect(Bun.file("packages/design-system/astryx.css").exists()).resolves.toBe(true);
    await expect(Bun.file("packages/design-system/CONSUMPTION.md").exists()).resolves.toBe(true);
    await expect(Bun.file("packages/design-system/DESIGN.md").exists()).resolves.toBe(true);
    await expect(Bun.file("packages/design-system/tokens.json").exists()).resolves.toBe(true);
    await expect(Bun.file("packages/design-system/tailwind.css").exists()).resolves.toBe(true);
    await expect(Bun.file("packages/design-system/variables.css").exists()).resolves.toBe(true);
  });
});

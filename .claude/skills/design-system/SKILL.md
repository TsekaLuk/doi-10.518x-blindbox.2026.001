---
name: design-system
description: Apply the project's canonical design system (GSAP-site language via styles.refero.design) when building or styling any UI. Use for colors, typography, spacing, buttons, layout decisions.
---

# Project Design System

The canonical design reference is `packages/design-system/DESIGN.md` (extracted from
https://styles.refero.design/style/00537a20-e99e-4ef2-b119-c6f532c44cc9).
Read it before styling anything.

Read `packages/design-system/CONSUMPTION.md` before styling UI.

Quick tokens (provided by `@vibe/design-system/variables.css`, `astryx.css`, and `tailwind.css`, imported from
`apps/web/src/styles/global.css`):

- Brand runtime tokens are prefixed: `--vibe-color-just-black` #0e100f · `--vibe-color-surface-cream` #fffce1 · `--vibe-color-surface-50` #7c7c6f
- Astryx consumes the bridge tokens: `--color-background-body`, `--color-text-primary`, `--color-border`, `--color-accent`
- Discipline accents: scroll #fec5fb · svg #ff8709 · text #9d95ff · ui #00bae2
- Type: Mori (fallback Inter/system), body 16-19px, line-height 1.15; huge display headings, tight letter-spacing
- Consume UI controls through Astryx components (`@astryxdesign/core/Button`, `TextInput`, `Banner`, `Text`, etc.) under `Theme` + `neutralTheme`
- Tailwind is for app shell layout, positioning, responsive sizing, scene overlays, and brand utility classes only
- Do not use Tailwind to restyle Astryx component internals; bridge visual changes through `astryx.css`
- Do not define unprefixed brand `--spacing-*` or `--radius-*` tokens; those collide with Astryx/Tailwind

Follow the Do / Don't lists in `packages/design-system/DESIGN.md` strictly.

# Vibe — AI Native Web Experience (Hackathon MVP)

Status: active · Started: 2026-07-06

Natural language → 3D scene graph → animated web experience.
MVP now, productization hooks reserved — see `ARCHITECTURE.md`.

## Stack

- **Web**: Vite · React 19 · TS · Tailwind v4 · Astryx DS · Three.js/R3F/Drei · GSAP+ScrollTrigger · Zustand
- **Server**: Bun · Hono · tRPC · SSE (thin AI proxy — the only place API keys live)
- **AI**: `AIService` interface (`packages/ai`) — fetch impl now, model-router later
- **Data**: Scene Graph / Timeline / Assets as versioned zod-validated JSON (`packages/scene`)

## Run

```bash
cp .env.example .env       # fill AI_API_KEY (any OpenAI-compatible endpoint)
bun install
bun run dev:server         # :8787
bun run dev:web            # :5173
```

## Quality gates

```bash
bun run typecheck          # all workspace TS projects
bun run typecheck:tests    # Bun test files
bun run test               # schema / AI / SSE unit tests
bun run build              # production web build
bun run check              # CI parity: all of the above
```

GitHub Actions runs `bun run check` on pushes to `main`, pull requests, and manual dispatch.

## Design system

Canonical reference: `packages/design-system/DESIGN.md` (GSAP-site design language, extracted from
[styles.refero.design](https://styles.refero.design/style/00537a20-e99e-4ef2-b119-c6f532c44cc9)).
Machine-consumable tokens live in `packages/design-system/tokens.json`; runtime CSS is split into
raw brand `variables.css`, Astryx component bridge `astryx.css`, and Tailwind utility bridge
`tailwind.css`. The responsibility split is documented in `packages/design-system/CONSUMPTION.md`.

The web app consumes [Astryx](https://astryx.atmeta.com/) as the component system:
`Theme` + `neutralTheme` wrap the app, UI controls import from `@astryxdesign/core/<Component>`,
and `@vibe/design-system/astryx.css` maps the GSAP-like brand tokens into Astryx token names.
Tailwind is used for app shell layout, positioning, and brand utility classes only.
The project skill
(`.claude/skills/design-system`) keeps agents on-language.

## Agent infrastructure

- **GSAP skills** (official, greensock/gsap-skills): installed at `.claude/skills/gsap-*`
- **Impeccable** (design vocabulary for agents) — run once yourself inside Claude Code:
  ```
  /plugin marketplace add pbakaus/impeccable
  /plugin   # install "impeccable", then /impeccable init
  ```
- **Refero MCP** (search styles.refero.design DESIGN.md library) — optional, run yourself:
  ```bash
  claude mcp add refero -- npx -y fidgetcoding-refero-mcp
  ```
  (Official hosted Refero MCP requires a Refero account: https://refero.design/mcp)

## Workspace docs

`ideas.md` / `notes.md` / `links.md` — hackathon working notes. `ARCHITECTURE.md` — module map & seams.

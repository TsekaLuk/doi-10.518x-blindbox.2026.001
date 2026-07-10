# 人格盲盒 — Persona Blind Box (Hackathon Product)

Status: active · Started: 2026-07-06

Talk to an AI. It generates a brand-new, never-repeated "personality" — diagnosed
through a 6-layer, literature-grounded theory (Big Five, attachment style, defense
mechanisms, Jungian persona/shadow, an internet-culture archetype, and a derived
color palette — see `PERSONA_THEORY.md` for full academic citations), revealed via
a 3D blind-box-opening animation, rendered as a collectible-figurine portrait,
narrated in character by TTS, and packaged into one shareable result card. Optional:
live realtime voice conversation with your own generated persona, and a "grow a 3D
figurine" bonus. Powered by Alibaba Cloud Bailian (阿里云百炼) — real models, no
placeholders. See `ARCHITECTURE.md` for the module map.

## Stack

- **Web**: Vite · React 19 · TS · Tailwind v4 · Astryx DS · Three.js/R3F/Drei · GSAP+ScrollTrigger · Zustand
- **Server**: Bun · Hono · tRPC · SSE (thin AI proxy — the only place API keys live)
- **AI**: `AIService` interface (`packages/ai`), backed by real Bailian/DashScope models:
  - Persona generation (thinking): `qwen3.7-plus`
  - Portrait: `wan2.7-image-pro` (collectible-figurine style; ~60-90s, see `apps/server/src/ai/upstream.ts`)
  - TTS: `cosyvoice-v3-flash` (29-voice curated preset catalog incl. dialects)
  - Realtime voice: `qwen3.5-omni-plus-realtime` (WebSocket relay, server never exposes the key)
  - 3D figurine: Tripo (`Tripo-P1.0`/`Tripo-H3.1`) via direct DashScope REST
- **Data**: Scene Graph / Timeline / Assets as versioned zod-validated JSON (`packages/scene`)

## Run

```bash
cp .env.example .env       # fill AI_API_KEY (DashScope/Bailian key), BAILIAN_WORKSPACE_ID (for realtime voice)
bun install
bun run dev:server         # :8787
bun run dev:web            # :5173 (or next free port)
```

Realtime voice needs `BAILIAN_WORKSPACE_ID` (get it via `bl auth login --console --console-site domestic` then `bl workspace list`) — the feature gracefully disables itself if unset. The Tripo 3D figurine bonus needs the Tripo product activated once in the Bailian console model marketplace (`/cn-beijing/?tab=model#/model-market/all`).

## Public demo

Hackathon judging entry:

```text
https://tsekaluk.github.io/doi-10.518x-blindbox.2026.001/
```

The judging page is served by GitHub Pages (`gh-pages` branch) because `vercel.app`
DNS is unreliable on the current network and can surface certificate mismatch
errors. The page calls the public API at:

```text
https://persona-blindbox-2026.loca.lt
```

On the demo host, `/workspace/persona-blindbox/run-public-demo.sh` keeps the Bun
API server and the fixed localtunnel subdomain alive. If the host restarts, start
it again from `/workspace/persona-blindbox`:

```bash
nohup ./run-public-demo.sh >demo-watchdog.log 2>&1 &
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

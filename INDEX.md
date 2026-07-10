# INDEX

Purpose:

- Hackathon product: **人格盲盒 (Persona Blind Box)** — talk to an AI, it generates a
  brand-new never-repeated "personality" (6-layer, literature-grounded diagnosis, see
  `PERSONA_THEORY.md`), reveals it via a 3D blind-box-opening animation, renders a
  collectible-figurine portrait, narrates it in character, and resolves into one
  shareable result card. Stretch: live realtime voice chat with your own persona,
  and a "grow a 3D figurine" bonus via Tripo. Built on Alibaba Cloud Bailian (百炼).

Inventory:

- `README.md`: how to run; agent-infrastructure install notes.
  - Public judging entry: `https://tsekaluk.github.io/doi-10.518x-blindbox.2026.001/`
    backed by `https://persona-blindbox-2026.loca.lt`.
- `ARCHITECTURE.md`: module map, the four productization seams, post-hackathon checklist.
- `PERSONA_THEORY.md`: the 6-layer persona-generation theory + full academic citations.
- `apps/web/`: Vite + React 19 + Tailwind v4 + Astryx + R3F/Drei + GSAP + Zustand frontend.
  - `src/persona/PersonaFlow.tsx`: the main product flow (input → generating → revealing → revealed).
  - `src/persona/resultCard.ts`: canvas result-card compositor (1080×1350, palette-derived).
  - `src/scene/blindbox.ts`: the box-opening 3D SceneGraph+Timeline builder.
  - `src/realtime/useRealtimeVoice.ts`: realtime voice chat hook (WebSocket to the server relay).
  - `src/components/FigurineViewer.tsx`: Tripo 3D figurine viewer + polling hook.
- `apps/server/`: Bun + Hono + tRPC + SSE thin AI proxy (only place holding API keys).
  - Real Bailian integration: chat/thinking (compatible-mode), image gen + TTS (via `bl` CLI
    subprocess), Tripo 3D gen (direct DashScope REST), realtime voice (WebSocket relay via
    `hono/bun`'s `createBunWebSocket`).
- `packages/scene/`: Scene Graph / Timeline / Asset zod schemas (declarative data layer).
- `packages/ai/`: `AIService` interface + fetch/SSE impl; `prompts.ts` holds the
  6-layer `PERSONA_SYSTEM_PROMPT`.
- `packages/shared/`: API routes, SSE event names, message types, `persona.ts`
  (Persona schema + the 6-layer taxonomies: Big Five, attachment style, defense
  mechanism/rarity, archetypes, voice map).
- `packages/design-system/`: canonical `DESIGN.md`, `tokens.json`, `variables.css`, Astryx bridge `astryx.css`, Tailwind bridge `tailwind.css`, consumption boundaries.
- `tests/`: Bun unit tests for scene schemas, AI prompt helpers, routing, and SSE parsing.
- `.github/workflows/ci.yml`: CI installs with Bun and runs `bun run check`.
- `.vercelignore`: excludes local secrets/build outputs from Vercel upload.
- `vercel.json`: Vercel production build config for the monorepo web app.
- `api/[...path].ts`: Vercel Functions fallback/persistent HTTP AI API for the
  Vercel-hosted demo (chat stream, image, TTS, Tripo 3D; realtime remains Bun-only).
- `deploy/k8s/`: layered Kustomize deployment for the API (`base` plus production
  ingress/secret/image overlay); see its README for infrastructure requirements.
- `tsconfig.test.json`: typecheck config for Bun test files.
- `.claude/skills/`: gsap-* (8 official GSAP skills) + design-system.
- `ideas.md`, `notes.md`, `links.md`: working notes.
- `AGENTS.md`, `CLAUDE.md`: agent instructions.

Active Items:

- Pivoted from the generic "NL → 3D scene" MVP to 人格盲盒, powered by real Bailian
  models (not placeholders): qwen3.7-plus (thinking), wan2.7-image-pro (portrait),
  cosyvoice-v3-flash (TTS, preset voice catalog), qwen3.5-omni-plus-realtime
  (realtime voice), Tripo-P1.0/H3.1 (3D figurine) — all live-tested against the
  real API, not mocked (2026-07-10).
- Known trade-off: wan2.7-image-pro portrait generation takes ~60-90s (confirmed
  current-gen flagship, not a legacy model — see `apps/server/src/ai/upstream.ts`
  comment for the full latency comparison against alternatives). The "revealing"
  step UI in `PersonaFlow.tsx` reframes this wait as part of the blind-box
  unboxing ritual rather than hiding it.
- `bun run typecheck` + `bun run build` pass clean.
- Realtime voice WebSocket relay confirmed working end-to-end (session.created/
  session.updated round trip against the real DashScope endpoint).
- Tripo 3D generation requires one-time product activation in the Bailian console
  (`https://bailian.console.aliyun.com/cn-beijing/?tab=model#/model-market/all`) —
  already done for this account; confirmed full PENDING→RUNNING→SUCCEEDED cycle.

Links:

- Design source: https://styles.refero.design/style/00537a20-e99e-4ef2-b119-c6f532c44cc9

Maintenance:

- Update this file when meaningful files or folders are added, moved, or archived.
- Keep entries short enough to scan.
- Last reviewed: 2026-07-10.

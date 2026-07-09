# INDEX

Purpose:

- Hackathon MVP: AI Native Web Experience — natural language → 3D scene graph → animated web page.

Inventory:

- `README.md`: how to run; agent-infrastructure install notes.
- `ARCHITECTURE.md`: module map, the four productization seams, post-hackathon checklist.
- `apps/web/`: Vite + React 19 + Tailwind v4 + Astryx + R3F/Drei + GSAP + Zustand frontend.
- `apps/server/`: Bun + Hono + tRPC + SSE thin AI proxy (only place holding API keys).
- `packages/scene/`: Scene Graph / Timeline / Asset zod schemas (declarative data layer).
- `packages/ai/`: `AIService` interface + fetch/SSE impl + model registry (nano-banana-2-lite, omini-flash).
- `packages/shared/`: API routes, SSE event names, message types.
- `packages/design-system/`: canonical `DESIGN.md`, `tokens.json`, `variables.css`, Astryx bridge `astryx.css`, Tailwind bridge `tailwind.css`, consumption boundaries.
- `tests/`: Bun unit tests for scene schemas, AI prompt helpers, routing, and SSE parsing.
- `.github/workflows/ci.yml`: CI installs with Bun and runs `bun run check`.
- `tsconfig.test.json`: typecheck config for Bun test files.
- `.claude/skills/`: gsap-* (8 official GSAP skills) + design-system.
- `ideas.md`, `notes.md`, `links.md`: working notes.
- `AGENTS.md`, `CLAUDE.md`: agent instructions.

Active Items:

- MVP scaffold complete (typecheck + build + server smoke-tested 2026-07-08).
- Infrastructure gate added: `bun run check` = typecheck, test typecheck, unit tests, web build (2026-07-09).
- Design system package added and consumed by web CSS; Astryx/Tailwind responsibilities split and tested (2026-07-09).
- Pending user action: fill `.env` (AI_API_KEY), install Impeccable plugin + Refero MCP (see README).

Links:

- Design source: https://styles.refero.design/style/00537a20-e99e-4ef2-b119-c6f532c44cc9

Maintenance:

- Update this file when meaningful files or folders are added, moved, or archived.
- Keep entries short enough to scan.
- Last reviewed: 2026-07-09.

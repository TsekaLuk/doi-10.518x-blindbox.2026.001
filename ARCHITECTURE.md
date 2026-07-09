# Architecture — AI Native Web Experience

MVP now, productization hooks reserved. See the module map in the hackathon brief; this file maps it to code.

## Layout

```
apps/
  web/        Vite + React 19 + TS · Tailwind v4 · Astryx DS · R3F/Drei · GSAP · Zustand
  server/     Bun + Hono + tRPC · SSE — thin AI proxy, only place holding API keys
packages/
  scene/      Scene Graph + Timeline + Asset schemas (zod) — the declarative data layer
  ai/         AIService interface + fetch/SSE implementation + model registry/router
  shared/     API routes, SSE event names, message types
  design-system/
              Canonical DESIGN.md + tokens.json + variables/Astryx/Tailwind CSS entry points
.claude/
  skills/     gsap-core/timeline/scrolltrigger/plugins/utils/react/performance/frameworks
.mcp.json     Refero MCP (DESIGN.md search over styles.refero.design)
```

## The four seams (关键设计原则 → 代码位置)

1. **接口隔离 — `AIService`** (`packages/ai/src/types.ts`)
   UI only knows the interface. MVP impl: `createHttpAIService` (fetch → Hono proxy → SSE).
   Reserved in the same file: `ModelRouter`(多模型路由), `EmbeddingService`(RAG), `LocalModelService`(Whisper/SD), `CallOptions.onPartial`(streaming structured output). Swap implementations, callers untouched.

2. **3D 场景 = 声明式数据** (`packages/scene/src/schema.ts`, `timeline.ts`)
   Scene Graph & Timeline are versioned JSON validated by zod. `apps/web/src/scene/SceneRenderer.tsx` is a pure renderer of that JSON; `apps/web/src/animation/compileTimeline.ts` compiles Timeline JSON → GSAP (+ScrollTrigger). WebGPU / export / Yjs collaboration are data-layer operations.

3. **状态可序列化** (`apps/web/src/state/store.ts`)
   Zustand store keeps the whole document under `doc`, with `dump()`/`hydrate()`. IndexedDB persistence and WebSocket/Yjs sync attach to that seam.

4. **Backend 薄代理** (`apps/server`)
   Hono = API-key proxy + SSE relay + tRPC. `src/middleware/auth.ts` is a pass-through stamping `anon` — Clerk/Lucia replaces just that middleware. DB/queue enter via tRPC context (`src/trpc.ts`). Routes never change.

5. **Design system consumption** (`packages/design-system`, `apps/web/src/styles/global.css`)
   Astryx owns components (`Theme` + `neutralTheme`, subpath component imports) and consumes `astryx.css` token mappings. Tailwind owns app shell/layout utilities and consumes `tailwind.css`. Raw brand facts stay in `variables.css` under `--vibe-*`; do not use Tailwind to restyle Astryx internals.

## Data flow

```
prompt ─▶ AIService.generateSceneGraph ─▶ POST /api/ai/stream (SSE)
      ─▶ upstream LLM (OpenAI-compatible, key server-side)
      ─▶ deltas ─▶ JSON extract ─▶ zod parse ─▶ store.setScene
      ─▶ SceneRenderer re-render + compileTimeline re-compile
```

## Productization checklist (赛后)

- 周1 Auth + DB: swap `middleware/auth.ts`, add db to tRPC context, un-reserve `scene.save/list/load` routers
- 周2 素材持久化 + 版本历史: `AssetResolver` (packages/scene/src/assets.ts) → DB/CDN-backed; undo/redo = snapshots of `store.dump()`
- 周3 导出 + CDN: Timeline JSON → deterministic playback → MP4 capture; assets by id via CDN
- 有用户后: Yjs on `doc`, BullMQ behind the proxy, `ModelRouter` real implementation

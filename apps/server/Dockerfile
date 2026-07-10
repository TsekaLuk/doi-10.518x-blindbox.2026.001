# Bun + Hono AI proxy for 人格盲盒.
# Node is included alongside Bun because image/TTS/ASR shell out to the
# `bl` CLI (bailian-cli, an npm global); bl reads DASHSCOPE_API_KEY from env.
FROM oven/bun:1.3-debian

# Node.js 22 is required by current bailian-cli dependencies.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && npm install -g bailian-cli \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace manifests first for layer caching.
COPY package.json bun.lock* ./
COPY apps/server/package.json apps/server/
COPY packages/scene/package.json packages/scene/
COPY packages/ai/package.json packages/ai/
COPY packages/shared/package.json packages/shared/
COPY packages/design-system/package.json packages/design-system/
RUN bun install --production || bun install

# Source (server + the workspace packages it imports).
COPY packages ./packages
COPY apps/server ./apps/server

ENV PORT=8787
ENV HOME=/tmp
# bl CLI auth: reads DASHSCOPE_API_KEY; the server itself reads AI_API_KEY.
# Set both to the same key in the runtime secret store.
EXPOSE 8787

RUN useradd --system --uid 10001 --create-home appuser
USER appuser

CMD ["bun", "run", "apps/server/src/index.ts"]

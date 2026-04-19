# Production image: unified Fastify app (static SPA + /api/*)
# Cloud Run sets PORT (default 8080); TRUST_PROXY=1 recommended behind Google frontends.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci && npm ci --prefix server

COPY . .
RUN npm run build && npm run build --prefix server

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# Cloud Run injects PORT at runtime (typically 8080)
ENV PORT=8080

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist

EXPOSE 8080

USER node
CMD ["node", "server/dist/index.js"]

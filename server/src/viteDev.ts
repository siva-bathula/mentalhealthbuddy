import middie from "@fastify/middie";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { createServer } from "vite";

/** Dev-only: Vite HMR/transforms behind Fastify (middleware mode). Not loaded in production installs. */
export async function registerViteDev(app: FastifyInstance, repoRoot: string): Promise<void> {
  await app.register(middie);

  const vite = await createServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    root: repoRoot,
    server: { middlewareMode: true },
    appType: "spa",
  });

  // @fastify/middie runs in `onRequest` before Fastify routing. Without this skip, Vite would
  // answer `/health` and `/api/*` (often as SPA HTML or 404) instead of Fastify handlers.
  await app.use((req, res, next) => {
    const pathname = (req.url ?? "").split("?")[0]?.split("#")[0] ?? "";
    if (pathname.startsWith("/api") || pathname === "/health") {
      next();
      return;
    }
    vite.middlewares(req, res, next);
  });
}

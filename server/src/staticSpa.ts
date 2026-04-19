import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/** Serve Vite `dist/` and fall back to `index.html` for client routing (production). */
export async function registerStaticSpa(app: FastifyInstance, distDir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: "/",
    wildcard: false,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      void reply.code(404).send();
      return;
    }
    const pathname = (request.url.split("?")[0] ?? "").split("#")[0] ?? "";
    if (pathname.startsWith("/api")) {
      void reply.code(404).send({ error: "Not found" });
      return;
    }
    return reply.sendFile("index.html");
  });
}

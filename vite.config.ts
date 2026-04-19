import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Consumed by Vite **middleware mode** inside Fastify (`server` package `npm run dev`).
 * UI and `/api` share one port — no proxy is used in that mode (Fastify owns `/api`).
 *
 * For **standalone** Vite (`npm run vite:dev`), keep **`npm run dev --prefix server`**
 * on **`PORT`** (default **8787**) so these proxies forward `/api` and `/health` to Fastify.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});

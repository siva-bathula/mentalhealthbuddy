export type ChatProvider = "deepseek" | "gemini";

export type Env = {
  PORT: number;
  FRONTEND_ORIGIN: string;
  /** When true (and NODE_ENV=production), CORS allows only FRONTEND_ORIGIN for browser requests that send Origin. */
  corsStrict: boolean;
  /** Trust X-Forwarded-* from reverse proxy (set when behind nginx/Cloudflare). */
  trustProxy: boolean;
  /** Max JSON/raw body size for POST (bytes). */
  bodyLimitBytes: number;
  /** 0 = no global request timeout (recommended for SSE). */
  requestTimeoutMs: number;
  /** Sliding window for API rate limit (ms). */
  rateLimitWindowMs: number;
  /** Max allowed API requests per IP per window. */
  rateLimitMaxPerWindow: number;
  /** Cap stored IP buckets to limit memory under abuse. */
  rateLimitMaxTrackedIps: number;
  CHAT_PROVIDER: ChatProvider;
  DEEPSEEK_API_KEY: string | undefined;
  DEEPSEEK_BASE_URL: string;
  DEEPSEEK_MODEL: string;
  /** Optional USD per 1M input tokens (for estimated cost logs / SSE). */
  DEEPSEEK_INPUT_USD_PER_1M: number | undefined;
  DEEPSEEK_OUTPUT_USD_PER_1M: number | undefined;
  GEMINI_API_KEY: string | undefined;
  GEMINI_MODEL: string;
  GEMINI_INPUT_USD_PER_1M: number | undefined;
  GEMINI_OUTPUT_USD_PER_1M: number | undefined;
};

function parsePositiveInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function loadEnv(): Env {
  const PORT = Number(process.env.PORT ?? "8787") || 8787;
  /** Used when documenting split UI/API setups; unified dev uses same-origin + CORS `origin: true`. */
  const FRONTEND_ORIGIN =
    process.env.FRONTEND_ORIGIN?.trim() ?? `http://localhost:${PORT}`;
  const corsStrict =
    process.env.CORS_STRICT?.trim().toLowerCase() === "true" ||
    process.env.CORS_STRICT?.trim() === "1";
  const trustProxy =
    process.env.TRUST_PROXY?.trim().toLowerCase() === "true" ||
    process.env.TRUST_PROXY?.trim() === "1";
  const bodyLimitBytes = parsePositiveInt(process.env.BODY_LIMIT_BYTES, 524_288, 4096, 8 * 1024 * 1024);
  const requestTimeoutMs = parsePositiveInt(process.env.REQUEST_TIMEOUT_MS, 0, 0, 3_600_000);
  const rateLimitWindowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000, 1000, 3_600_000);
  const rateLimitMaxPerWindow = parsePositiveInt(process.env.RATE_LIMIT_MAX_PER_WINDOW, 40, 1, 10_000);
  const rateLimitMaxTrackedIps = parsePositiveInt(
    process.env.RATE_LIMIT_MAX_TRACKED_IPS,
    20_000,
    1000,
    500_000,
  );
  const rawProvider = (process.env.CHAT_PROVIDER ?? "deepseek").toLowerCase();
  if (rawProvider !== "deepseek" && rawProvider !== "gemini") {
    throw new Error(`CHAT_PROVIDER must be "deepseek" or "gemini", got "${rawProvider}"`);
  }
  const CHAT_PROVIDER = rawProvider as ChatProvider;

  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim();
  const DEEPSEEK_BASE_URL =
    process.env.DEEPSEEK_BASE_URL?.trim() ?? "https://api.deepseek.com/v1";
  const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-chat";

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
  const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() ?? "gemini-2.5-flash";

  const parsePrice = (key: string): number | undefined => {
    const raw = process.env[key]?.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  const DEEPSEEK_INPUT_USD_PER_1M = parsePrice("DEEPSEEK_INPUT_USD_PER_1M");
  const DEEPSEEK_OUTPUT_USD_PER_1M = parsePrice("DEEPSEEK_OUTPUT_USD_PER_1M");
  const GEMINI_INPUT_USD_PER_1M = parsePrice("GEMINI_INPUT_USD_PER_1M");
  const GEMINI_OUTPUT_USD_PER_1M = parsePrice("GEMINI_OUTPUT_USD_PER_1M");

  return {
    PORT,
    FRONTEND_ORIGIN,
    corsStrict,
    trustProxy,
    bodyLimitBytes,
    requestTimeoutMs,
    rateLimitWindowMs,
    rateLimitMaxPerWindow,
    rateLimitMaxTrackedIps,
    CHAT_PROVIDER,
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
    DEEPSEEK_INPUT_USD_PER_1M,
    DEEPSEEK_OUTPUT_USD_PER_1M,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_INPUT_USD_PER_1M,
    GEMINI_OUTPUT_USD_PER_1M,
  };
}

/** Non-null when the active provider cannot run until env is fixed. */
export function providerConfigError(env: Env): string | null {
  if (env.CHAT_PROVIDER === "deepseek" && !env.DEEPSEEK_API_KEY) {
    return "Server is missing DEEPSEEK_API_KEY. Add it to server/.env or set CHAT_PROVIDER=gemini and GEMINI_API_KEY.";
  }
  if (env.CHAT_PROVIDER === "gemini" && !env.GEMINI_API_KEY) {
    return "Server is missing GEMINI_API_KEY. Add it to server/.env or set CHAT_PROVIDER=deepseek and DEEPSEEK_API_KEY.";
  }
  return null;
}

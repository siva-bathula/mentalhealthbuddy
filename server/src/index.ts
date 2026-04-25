import cors from "@fastify/cors";
import "dotenv/config";
import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { loadEnv, providerConfigError } from "./env.js";
import {
  getActiveProvider,
  initProviderFailover,
  markProviderFailure,
  markProviderSuccess,
  streamLlm,
} from "./providerFailover.js";
import { getRepoRoot } from "./paths.js";
import { prefilterLastUserMessage } from "./prefilter.js";
import type { ChatStreamYield } from "./chatStreamTypes.js";
import type { NormalizedUsage } from "./tokenUsage.js";
import type { ChatTurn } from "./providers/deepseek.js";
import helmet from "@fastify/helmet";
import { initRateLimit, rateLimitAllow } from "./rateLimit.js";
import { refreshUsdInrAtStartup, usdCostToInr, usdToInrRate } from "./fxUsdInr.js";
import { buildPlanExportDoc } from "./planExportDoc.js";
import { PLAN_SYSTEM_PROMPT } from "./planSystemPrompt.js";
import { REFRAME_SYSTEM_PROMPT } from "./reframeSystemPrompt.js";
import { GROUNDING_SYSTEM_PROMPT } from "./groundingSystemPrompt.js";
import { registerStaticSpa } from "./staticSpa.js";
import { sseData, sseDone } from "./sse.js";

const env = loadEnv();
initProviderFailover(env);

initRateLimit({
  windowMs: env.rateLimitWindowMs,
  maxPerWindow: env.rateLimitMaxPerWindow,
  maxTrackedIps: env.rateLimitMaxTrackedIps,
});

const repoRoot = getRepoRoot();
const distDir = path.join(repoRoot, "dist");
const hasDist = fs.existsSync(path.join(distDir, "index.html"));
const isProduction = process.env.NODE_ENV === "production";

/** Pino `base`: OS hostname is often `localhost` in containers; Cloud Run sets `K_SERVICE` / `K_REVISION`. */
const loggerBase: Record<string, unknown> = {
  pid: process.pid,
  hostname: os.hostname(),
};
if (process.env.K_SERVICE) loggerBase.service = process.env.K_SERVICE;
if (process.env.K_REVISION) loggerBase.revision = process.env.K_REVISION;

const app = Fastify({
  logger: {
    level: env.logLevel,
    base: loggerBase,
  },
  bodyLimit: env.bodyLimitBytes,
  ...(env.requestTimeoutMs > 0 ? { requestTimeout: env.requestTimeoutMs } : {}),
  trustProxy: env.trustProxy,
});

await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
});

await app.register(cors, {
  origin:
    isProduction && env.corsStrict
      ? (origin, cb) => {
          if (origin === undefined || origin === "") {
            cb(null, true);
            return;
          }
          cb(null, origin === env.FRONTEND_ORIGIN);
        }
      : true,
  methods: ["GET", "POST", "OPTIONS"],
});

type ChatBody = {
  messages?: Array<{ role?: string; content?: unknown }>;
  stream?: boolean;
  /** Optional client thread id for usage logs (device-local conversation id). */
  conversationId?: unknown;
};

function normalizeMessages(body: ChatBody): ChatTurn[] | null {
  const raw = body.messages;
  if (!Array.isArray(raw)) return null;
  const out: ChatTurn[] = [];
  for (const m of raw) {
    if (m?.role !== "user" && m?.role !== "assistant") continue;
    if (typeof m.content !== "string") continue;
    const c = m.content.trim();
    if (!c) continue;
    out.push({ role: m.role, content: m.content });
  }
  return out.length ? out : null;
}

function clientIp(req: { ip: string; headers: Record<string, unknown> }) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0]?.trim() ?? req.ip;
  return req.ip;
}

function sanitizeConversationId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().slice(0, 128);
  return s.length ? s : undefined;
}

function sseReadable(
  gen: AsyncGenerator<ChatStreamYield, void, unknown>,
  opts: {
    log: { info: (obj: Record<string, unknown>) => void; warn: (obj: Record<string, unknown>) => void };
    conversationId?: string;
    provider: string;
    /** Log event name for structured logs (default chat_stream_usage). */
    usageMsg?: string;
    onStreamSuccess?: () => void;
    onStreamFailure?: () => void;
  },
): Readable {
  return Readable.from(
    (async function* () {
      try {
        for await (const chunk of gen) {
          if (chunk.kind === "delta") {
            yield sseData({ delta: chunk.text });
            continue;
          }
          const costInr = usdCostToInr(chunk.costUsd);
          opts.log.info({
            msg: opts.usageMsg ?? "chat_stream_usage",
            conversationId: opts.conversationId,
            provider: opts.provider,
            promptTokens: chunk.usage.promptTokens,
            completionTokens: chunk.usage.completionTokens,
            totalTokens: chunk.usage.totalTokens,
            costUsd: chunk.costUsd,
            costInr,
          });
          yield sseData({
            usage: chunk.usage,
            costUsd: chunk.costUsd,
            costInr,
          });
        }
        opts.onStreamSuccess?.();
        yield sseDone();
      } catch (e) {
        opts.onStreamFailure?.();
        yield sseData({
          error: e instanceof Error ? e.message : "Upstream model error",
        });
        yield sseDone();
      }
    })(),
  );
}

app.get("/health", async () => ({
  ok: true,
  /** INR per 1 USD at server startup (Frankfurter); null if fetch failed. */
  usdToInr: usdToInrRate(),
}));

app.post("/api/chat", async (req, reply) => {
  const ip = clientIp(req);
  if (!rateLimitAllow(ip)) {
    reply.code(429);
    return { error: "Too many requests. Try again in a minute." };
  }

  const body = req.body as ChatBody;
  const conversationId = sanitizeConversationId(body.conversationId);
  const wantStreamEarly = body.stream !== false;
  const cfgErr = providerConfigError(env);
  if (cfgErr) {
    if (!wantStreamEarly) {
      reply.code(503);
      return { error: cfgErr };
    }
    const stream = Readable.from([sseData({ error: cfgErr }), sseDone()]);
    return reply.type("text/event-stream").send(stream);
  }

  const messages = normalizeMessages(body);
  if (!messages) {
    reply.code(400);
    return { error: "Expected { messages: [{ role, content }] } with user/assistant turns." };
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    reply.code(400);
    return { error: "At least one user message is required." };
  }

  const gate = prefilterLastUserMessage(lastUser.content);
  const wantStream = body.stream !== false;

  if (gate.action === "block") {
    if (!wantStream) {
      return { message: { role: "assistant", content: gate.response } };
    }
    const stream = Readable.from([sseData({ delta: gate.response }), sseDone()]);
    return reply.type("text/event-stream").send(stream);
  }

  const thread: ChatTurn[] = messages;

  if (!wantStream) {
    const provider = getActiveProvider();
    try {
      let full = "";
      let usageMeta: NormalizedUsage | undefined;
      let costUsd: number | null | undefined;
      const iter = streamLlm(env, provider, thread);
      for await (const y of iter) {
        if (y.kind === "delta") full += y.text;
        else {
          usageMeta = y.usage;
          costUsd = y.costUsd;
        }
      }
      markProviderSuccess();
      const costInr = usdCostToInr(costUsd ?? null);
      if (usageMeta) {
        req.log.info({
          msg: "chat_completion_usage",
          conversationId,
          provider,
          promptTokens: usageMeta.promptTokens,
          completionTokens: usageMeta.completionTokens,
          totalTokens: usageMeta.totalTokens,
          costUsd: costUsd ?? null,
          costInr,
        });
      }
      return {
        message: { role: "assistant", content: full },
        usage: usageMeta ?? null,
        costUsd: costUsd ?? null,
        costInr,
      };
    } catch (e) {
      markProviderFailure(env, req.log);
      req.log.error(e);
      reply.code(502);
      return {
        error: e instanceof Error ? e.message : "Upstream model error",
      };
    }
  }

  const streamProvider = getActiveProvider();
  async function* streamChat(): AsyncGenerator<ChatStreamYield, void, unknown> {
    yield* streamLlm(env, streamProvider, thread);
  }

  return reply.type("text/event-stream").send(
    sseReadable(streamChat(), {
      log: req.log,
      conversationId,
      provider: streamProvider,
      onStreamSuccess: markProviderSuccess,
      onStreamFailure: () => markProviderFailure(env, req.log),
    }),
  );
});

app.post("/api/plan", async (req, reply) => {
  const ip = clientIp(req);
  if (!rateLimitAllow(ip)) {
    reply.code(429);
    return { error: "Too many requests. Try again in a minute." };
  }

  const body = req.body as ChatBody;
  const conversationId = sanitizeConversationId(body.conversationId);
  const wantStreamEarly = body.stream !== false;
  const cfgErr = providerConfigError(env);
  if (cfgErr) {
    if (!wantStreamEarly) {
      reply.code(503);
      return { error: cfgErr };
    }
    const stream = Readable.from([sseData({ error: cfgErr }), sseDone()]);
    return reply.type("text/event-stream").send(stream);
  }

  const messages = normalizeMessages(body);
  if (!messages) {
    reply.code(400);
    return { error: "Expected { messages: [{ role, content }] } with user/assistant turns." };
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    reply.code(400);
    return { error: "At least one user message is required." };
  }

  const gate = prefilterLastUserMessage(lastUser.content);
  const wantStream = body.stream !== false;

  if (gate.action === "block") {
    if (!wantStream) {
      return { message: { role: "assistant", content: gate.response } };
    }
    const stream = Readable.from([sseData({ delta: gate.response }), sseDone()]);
    return reply.type("text/event-stream").send(stream);
  }

  const thread: ChatTurn[] = messages;

  if (!wantStream) {
    const provider = getActiveProvider();
    try {
      let full = "";
      let usageMeta: NormalizedUsage | undefined;
      let costUsd: number | null | undefined;
      const iter = streamLlm(env, provider, thread, PLAN_SYSTEM_PROMPT);
      for await (const y of iter) {
        if (y.kind === "delta") full += y.text;
        else {
          usageMeta = y.usage;
          costUsd = y.costUsd;
        }
      }
      markProviderSuccess();
      const costInr = usdCostToInr(costUsd ?? null);
      if (usageMeta) {
        req.log.info({
          msg: "plan_completion_usage",
          conversationId,
          provider,
          promptTokens: usageMeta.promptTokens,
          completionTokens: usageMeta.completionTokens,
          totalTokens: usageMeta.totalTokens,
          costUsd: costUsd ?? null,
          costInr,
        });
      }
      return {
        message: { role: "assistant", content: full },
        usage: usageMeta ?? null,
        costUsd: costUsd ?? null,
        costInr,
      };
    } catch (e) {
      markProviderFailure(env, req.log);
      req.log.error(e);
      reply.code(502);
      return {
        error: e instanceof Error ? e.message : "Upstream model error",
      };
    }
  }

  const streamProviderPlan = getActiveProvider();
  async function* streamPlan(): AsyncGenerator<ChatStreamYield, void, unknown> {
    yield* streamLlm(env, streamProviderPlan, thread, PLAN_SYSTEM_PROMPT);
  }

  return reply.type("text/event-stream").send(
    sseReadable(streamPlan(), {
      log: req.log,
      conversationId,
      provider: streamProviderPlan,
      usageMsg: "plan_stream_usage",
      onStreamSuccess: markProviderSuccess,
      onStreamFailure: () => markProviderFailure(env, req.log),
    }),
  );
});

app.post("/api/reframe", async (req, reply) => {
  const ip = clientIp(req);
  if (!rateLimitAllow(ip)) {
    reply.code(429);
    return { error: "Too many requests. Try again in a minute." };
  }

  const body = req.body as ChatBody;
  const conversationId = sanitizeConversationId(body.conversationId);
  const wantStreamEarly = body.stream !== false;
  const cfgErr = providerConfigError(env);
  if (cfgErr) {
    if (!wantStreamEarly) {
      reply.code(503);
      return { error: cfgErr };
    }
    const stream = Readable.from([sseData({ error: cfgErr }), sseDone()]);
    return reply.type("text/event-stream").send(stream);
  }

  const messages = normalizeMessages(body);
  if (!messages) {
    reply.code(400);
    return { error: "Expected { messages: [{ role, content }] } with user/assistant turns." };
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    reply.code(400);
    return { error: "At least one user message is required." };
  }

  const gate = prefilterLastUserMessage(lastUser.content);
  const wantStream = body.stream !== false;

  if (gate.action === "block") {
    if (!wantStream) {
      return { message: { role: "assistant", content: gate.response } };
    }
    const stream = Readable.from([sseData({ delta: gate.response }), sseDone()]);
    return reply.type("text/event-stream").send(stream);
  }

  const thread: ChatTurn[] = messages;

  if (!wantStream) {
    const provider = getActiveProvider();
    try {
      let full = "";
      let usageMeta: NormalizedUsage | undefined;
      let costUsd: number | null | undefined;
      const iter = streamLlm(env, provider, thread, REFRAME_SYSTEM_PROMPT);
      for await (const y of iter) {
        if (y.kind === "delta") full += y.text;
        else {
          usageMeta = y.usage;
          costUsd = y.costUsd;
        }
      }
      markProviderSuccess();
      const costInr = usdCostToInr(costUsd ?? null);
      if (usageMeta) {
        req.log.info({
          msg: "reframe_completion_usage",
          conversationId,
          provider,
          promptTokens: usageMeta.promptTokens,
          completionTokens: usageMeta.completionTokens,
          totalTokens: usageMeta.totalTokens,
          costUsd: costUsd ?? null,
          costInr,
        });
      }
      return {
        message: { role: "assistant", content: full },
        usage: usageMeta ?? null,
        costUsd: costUsd ?? null,
        costInr,
      };
    } catch (e) {
      markProviderFailure(env, req.log);
      req.log.error(e);
      reply.code(502);
      return {
        error: e instanceof Error ? e.message : "Upstream model error",
      };
    }
  }

  const streamProviderReframe = getActiveProvider();
  async function* streamReframe(): AsyncGenerator<ChatStreamYield, void, unknown> {
    yield* streamLlm(env, streamProviderReframe, thread, REFRAME_SYSTEM_PROMPT);
  }

  return reply.type("text/event-stream").send(
    sseReadable(streamReframe(), {
      log: req.log,
      conversationId,
      provider: streamProviderReframe,
      usageMsg: "reframe_stream_usage",
      onStreamSuccess: markProviderSuccess,
      onStreamFailure: () => markProviderFailure(env, req.log),
    }),
  );
});

app.post("/api/ground", async (req, reply) => {
  const ip = clientIp(req);
  if (!rateLimitAllow(ip)) {
    reply.code(429);
    return { error: "Too many requests. Try again in a minute." };
  }

  const body = req.body as ChatBody;
  const conversationId = sanitizeConversationId(body.conversationId);
  const wantStreamEarly = body.stream !== false;
  const cfgErr = providerConfigError(env);
  if (cfgErr) {
    if (!wantStreamEarly) {
      reply.code(503);
      return { error: cfgErr };
    }
    const stream = Readable.from([sseData({ error: cfgErr }), sseDone()]);
    return reply.type("text/event-stream").send(stream);
  }

  const messages = normalizeMessages(body);
  if (!messages) {
    reply.code(400);
    return { error: "Expected { messages: [{ role, content }] } with user/assistant turns." };
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    reply.code(400);
    return { error: "At least one user message is required." };
  }

  const gate = prefilterLastUserMessage(lastUser.content);
  const wantStream = body.stream !== false;

  if (gate.action === "block") {
    if (!wantStream) {
      return { message: { role: "assistant", content: gate.response } };
    }
    const stream = Readable.from([sseData({ delta: gate.response }), sseDone()]);
    return reply.type("text/event-stream").send(stream);
  }

  const thread: ChatTurn[] = messages;

  if (!wantStream) {
    const provider = getActiveProvider();
    try {
      let full = "";
      let usageMeta: NormalizedUsage | undefined;
      let costUsd: number | null | undefined;
      const iter = streamLlm(env, provider, thread, GROUNDING_SYSTEM_PROMPT);
      for await (const y of iter) {
        if (y.kind === "delta") full += y.text;
        else {
          usageMeta = y.usage;
          costUsd = y.costUsd;
        }
      }
      markProviderSuccess();
      const costInr = usdCostToInr(costUsd ?? null);
      if (usageMeta) {
        req.log.info({
          msg: "ground_completion_usage",
          conversationId,
          provider,
          promptTokens: usageMeta.promptTokens,
          completionTokens: usageMeta.completionTokens,
          totalTokens: usageMeta.totalTokens,
          costUsd: costUsd ?? null,
          costInr,
        });
      }
      return {
        message: { role: "assistant", content: full },
        usage: usageMeta ?? null,
        costUsd: costUsd ?? null,
        costInr,
      };
    } catch (e) {
      markProviderFailure(env, req.log);
      req.log.error(e);
      reply.code(502);
      return {
        error: e instanceof Error ? e.message : "Upstream model error",
      };
    }
  }

  const streamProviderGround = getActiveProvider();
  async function* streamGround(): AsyncGenerator<ChatStreamYield, void, unknown> {
    yield* streamLlm(env, streamProviderGround, thread, GROUNDING_SYSTEM_PROMPT);
  }

  return reply.type("text/event-stream").send(
    sseReadable(streamGround(), {
      log: req.log,
      conversationId,
      provider: streamProviderGround,
      usageMsg: "ground_stream_usage",
      onStreamSuccess: markProviderSuccess,
      onStreamFailure: () => markProviderFailure(env, req.log),
    }),
  );
});

type PlanExportBody = {
  title?: unknown;
  format?: unknown;
  messages?: ChatBody["messages"];
};

const MAX_EXPORT_CHARS = 400_000;

app.post("/api/plan/export", async (req, reply) => {
  const ip = clientIp(req);
  if (!rateLimitAllow(ip)) {
    reply.code(429);
    return { error: "Too many requests. Try again in a minute." };
  }

  const body = req.body as PlanExportBody;
  const messages = normalizeMessages({ messages: body.messages });
  if (!messages?.length) {
    reply.code(400);
    return { error: "Expected { messages: [{ role, content }] } with at least one turn." };
  }

  let totalChars = 0;
  for (const m of messages) {
    totalChars += m.content.length;
    if (totalChars > MAX_EXPORT_CHARS) {
      reply.code(413);
      return { error: "Export payload too large." };
    }
  }

  const fmtRaw = body.format;
  const format =
    fmtRaw === "plain" || fmtRaw === "markdown" ? fmtRaw : "plain";
  const title =
    typeof body.title === "string" ? body.title.slice(0, 200) : "Wellness plan";

  const { body: fileBody, contentType, filenameExt } = buildPlanExportDoc(
    format === "plain" ? "plain" : "markdown",
    title,
    messages,
  );

  const date = new Date().toISOString().slice(0, 10);
  const safeBase = title.replace(/[^\w\-]+/g, "_").slice(0, 48) || "wellness-plan";
  const filename = `${safeBase}-${date}.${filenameExt}`;

  return reply
    .header("Content-Type", contentType)
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(fileBody);
});

if (!isProduction) {
  const { registerViteDev } = await import("./viteDev.js");
  await registerViteDev(app, repoRoot);
  app.log.info(`Dev UI + API at http://127.0.0.1:${env.PORT} (Vite middleware)`);
} else if (hasDist) {
  await registerStaticSpa(app, distDir);
  app.log.debug(`Serving static SPA from ${distDir}`);
} else {
  app.log.warn(
    `NODE_ENV=production but no ${distDir}/index.html — API only. Run vite build from repo root first.`,
  );
}

await refreshUsdInrAtStartup(app.log);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
const cfg = providerConfigError(env);
if (cfg) app.log.warn(`Chat API disabled until configured: ${cfg}`);

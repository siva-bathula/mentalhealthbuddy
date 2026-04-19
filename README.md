# Mental Health Buddy

Web app with **Chat**, **Guided plan** (prompt-led planning with optional export), and **Thought challenger** (CBT-style cognitive reframing). Features use a small Node API that applies wellness/safety system prompts and calls **DeepSeek** or **Google Gemini** (keys stay on the server).

## Prerequisites

- Node.js 20+
- API key for the provider you enable (`CHAT_PROVIDER` in `server/.env`)

## Local development

The app runs as **one process**: Fastify hosts **Vite in middleware mode** (development) or **static `dist/`** (production) alongside **`/api/*`** on **`PORT`** (default **8787**).

1. **`server/.env`** — Copy `server/.env.example` to **`server/.env`**, set **`CHAT_PROVIDER`** and the matching API key.

2. From the **repository root**:

   ```bash
   npm install
   npm install --prefix server
   npm run dev
   ```

   Open **`http://localhost:8787`**. Same-origin **`POST /api/chat`**, **`/api/plan`**, **`/api/reframe`**, **`/api/ground`** use **`Accept: text/event-stream`** — each route uses its own system prompt on the server.

   The default server script uses **`tsx`** without filesystem watch so it binds to **`PORT`** immediately (some setups hang with **`tsx watch`** before anything listens). After editing **server** TypeScript, stop the process (**Ctrl+C**) and run **`npm run dev`** again. Optional auto-restart: **`npm run dev:watch --prefix server`**.

Standalone **Vite** (optional): **`npm run vite:dev`** — add the **`vite.config.ts`** proxy snippet from the comment in that file so **`/api`** forwards to Fastify while you run **`npm run dev --prefix server`** in another terminal.

## Troubleshooting chat / Network tab

- **Server never listens / connection refused** — Wait until the terminal shows **`Server listening at …`**. If **`npm run dev`** sits with no log for a long time, use the default script above (no **`tsx watch`**). Confirm **`GET http://localhost:8787/health`** returns **`{"ok":true}`** before loading the app.
- **`Route POST:/api/plan not found` (404)** — Fastify is running, but this process was started from an **old `server/dist`** that predates Guided plan routes. **`npm run dev`** runs **`server/src` via `tsx`** and always picks up new API code. **`npm run start --prefix server`** runs **`server/dist/index.js`** — after pulling changes, run **`npm run build --prefix server`** and restart. You can sanity-check with **`curl -s -X POST http://127.0.0.1:8787/api/plan -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}"`** (expect SSE or a JSON error about the model, **not** “Route … not found”).
- **`Route POST:/api/ground not found` (404)** — Same causes: redeploy/restart with an updated **`server/dist`**, or restart **`npm run dev`** so **`tsx`** loads current **`server/src/index.ts`**. **`curl`** test: **`curl -s -X POST http://127.0.0.1:8787/api/ground -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}"`**. For split builds, **`VITE_CHAT_API_URL`** should be the API **origin only** (e.g. **`https://your-host`**), **not** ending in **`/api`** — paths like **`/api/ground`** are appended automatically (the client also merges a mistaken **`…/api` + `/api/…`** double segment).
- **No traffic** — Confirm **Send** with non-empty input. DevTools → **Network** → **Fetch/XHR** → **`POST`** **`/api/chat`**, **`/api/plan`**, **`/api/reframe`**, or **`/api/ground`** on **`http://localhost:<PORT>`** when using unified dev.
- **Health** — **`GET http://localhost:8787/health`** → **`{"ok":true}`**.
- **`npm run preview`** — Preview is a standalone Vite server (no bundled API). Use **`npm run dev`** for integrated dev, or **`npm run build`** then **`npm run start --prefix server`** after building the SPA.
- **CORS errors in production** — If you set **`CORS_STRICT=true`**, **`FRONTEND_ORIGIN`** must equal the browser’s origin exactly (scheme + host + port). Same-origin **`localhost`** loads do not always send **`Origin`**; those requests are still allowed.

## Environment variables

| Location | Variable | Purpose |
|----------|----------|---------|
| `.env.development` (repo root) | `VITE_CHAT_API_URL` | Optional: full API origin if you force cross-origin chat from the browser (normally unset for same-origin `/api`) |
| Root `.env` / `.env.local` | `VITE_CHAT_API_URL` | Production builds when the API lives on another host |
| `server/.env` | `CHAT_PROVIDER` | `deepseek` or `gemini` |
| `server/.env` | `DEEPSEEK_*` / `GEMINI_*` | Provider credentials and models |
| `server/.env` | `FRONTEND_ORIGIN` | Browser origin for split deployments; required to match exactly when **`CORS_STRICT=true`** in production |
| `server/.env` | `CORS_STRICT` | When **`true`** and **`NODE_ENV=production`**, CORS allows only **`FRONTEND_ORIGIN`** for requests that send `Origin`. Default permissive **`origin: true`** otherwise |
| `server/.env` | `TRUST_PROXY` | Set **`true`** behind a reverse proxy so client IP (**`req.ip`** / **`x-forwarded-for`**) reflects the real visitor for rate limiting |
| `server/.env` | `BODY_LIMIT_BYTES` | Max JSON/raw body size for **`POST`** (default **524288**) |
| `server/.env` | `REQUEST_TIMEOUT_MS` | Fastify global request timeout; **0** (default) = disabled so **SSE** streams are not cut off |
| `server/.env` | `RATE_LIMIT_*` | **`RATE_LIMIT_WINDOW_MS`** (default **60000**), **`RATE_LIMIT_MAX_PER_WINDOW`** (**40**), **`RATE_LIMIT_MAX_TRACKED_IPS`** (**20000**) — see abuse section below |

## Production

- From repo root: **`npm run build`** (creates **`dist/`**), then **`npm run build --prefix server`** and **`npm run start --prefix server`** (`NODE_ENV=production`) — **one Node process** serves **`dist/`** and **`/api`** on **`PORT`**. Whenever API routes change, rebuild the server package (**`npm run build --prefix server`**) before restarting production; the UI bundle alone does not update **`server/dist`**.
- Alternatively host **`dist/`** on a CDN and run only the API elsewhere; set **`VITE_CHAT_API_URL`** at build time if needed.
- Use HTTPS; never expose provider API keys to the browser.

### Deploy to GCP (Firebase Hosting + Cloud Run)

This repo includes a **`Dockerfile`** that bakes in **`dist/`** + **`server/dist`** and runs **`node server/dist/index.js`** (same unified app as local production). Recommended pattern: **Firebase Hosting** rewrites all routes to **Cloud Run**, so the browser stays **same-origin** for **`/api/*`** and **SSE** (no **`VITE_CHAT_API_URL`** needed).

**Prerequisites**

- Google Cloud project with **Firebase** enabled (same project is simplest).
- Tools: **`gcloud`**, **`docker`**, **`firebase`** CLI (logged in with accounts that can deploy).
- APIs enabled (Console or first-run prompts): **Cloud Run**, **Artifact Registry** (or Container Registry), **Firebase Hosting**.

**1. Match names in config**

- In **`firebase.json`**, **`run.serviceId`** must equal your Cloud Run **service name** (default here: **`mentalhealthbuddy`**). Change **`run.region`** if you deploy elsewhere (keep Cloud Run and this value in sync).
- Copy **`.firebaserc.example`** to **`.firebaserc`** and set your Firebase **project id**.
- **`firebase/hosting-public/`** is a minimal static root required by Hosting; all traffic is rewritten to Cloud Run, so users never see these files.

**2. Build and push the image**

Pick an Artifact Registry repo (example: **`REGION-docker.pkg.dev/PROJECT_ID/APP/mentalhealthbuddy`**):

```bash
docker build -t REGION-docker.pkg.dev/PROJECT_ID/APP/mentalhealthbuddy:v1 .
gcloud auth configure-docker REGION-docker.pkg.dev
docker push REGION-docker.pkg.dev/PROJECT_ID/APP/mentalhealthbuddy:v1
```

**3. Deploy Cloud Run**

Use **Secret Manager** (recommended) or console env vars for **`DEEPSEEK_API_KEY`** / **`GEMINI_API_KEY`**. Example with env vars (replace values; use secrets in production):

```bash
gcloud run deploy mentalhealthbuddy \
  --image REGION-docker.pkg.dev/PROJECT_ID/APP/mentalhealthbuddy:v1 \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 3600 \
  --memory 512Mi \
  --set-env-vars "NODE_ENV=production,PORT=8080,TRUST_PROXY=true,CORS_STRICT=true,FRONTEND_ORIGIN=https://PROJECT_ID.web.app,CHAT_PROVIDER=deepseek"
```

- **`FRONTEND_ORIGIN`**: Your real **HTTPS** origin (e.g. **`https://yourproject.web.app`**, **`https://yourproject.firebaseapp.com`**, or a **custom domain**). Must match what users type in the browser when **`CORS_STRICT=true`**.
- **`TRUST_PROXY=true`**: Correct client IP behind Google’s edge (rate limiting).
- **`--timeout 3600`**: Longer **SSE** streams; tune as needed.

**4. Allow Firebase Hosting to call Cloud Run**

In **Google Cloud Console** → **Cloud Run** → your service → **Permissions**: ensure the Firebase Hosting service account (**`firebase-adminsdk-*@` or the Hosting rewrite service account**) has **`Cloud Run Invoker`** on this service. The first time you run **`firebase deploy --only hosting`**, Firebase may prompt you to enable the link.

**5. Deploy Hosting**

```bash
firebase deploy --only hosting
```

Open the Hosting URL (**`https://<project>.web.app`**). **`GET /health`** and the app UI should load from the same origin as **`POST /api/chat`**.

**6. Alternative: Cloud Run only**

Skip Firebase Hosting and map a **custom domain** directly on **Cloud Run**, or use a **global load balancer** — still use the same Docker image and env vars.

## Free tier, costs, and abuse controls

The **`POST`** LLM routes (**`/api/chat`**, **`/api/plan`**, **`/api/reframe`**, **`/api/ground`**) and **`/api/plan/export`** use **in-process rate limiting** per client IP ([`server/src/rateLimit.ts`](server/src/rateLimit.ts)): a sliding window (**`RATE_LIMIT_MAX_PER_WINDOW`** requests per **`RATE_LIMIT_WINDOW_MS`**). **`GET /health`** is **not** rate-limited so uptime checks keep working. Tune env vars before high traffic.

**Memory:** Stale IP buckets are pruned periodically; **`RATE_LIMIT_MAX_TRACKED_IPS`** caps how many client keys are kept (important if many spoofed or rotating IPs hit the server). Limits apply **per Node process** — behind multiple replicas, each instance has its own counters; use **Redis**-backed rate limiting at the edge or in the app if you need a global shared limit.

**Costs:** Each chat send triggers an LLM call (provider billing). **`BODY_LIMIT_BYTES`** rejects oversized **`POST`** bodies early. Keeping conversations short and enforcing rate limits helps keep a public deployment sustainable.

**Abuse:** Rate limiting is the primary application-layer guardrail; add IP blocklists, CAPTCHA, or authenticated quotas if you expose the API broadly. Logs depend on your host — document what you retain if you operate a public instance.

**API keys:** Provider keys live only in **`server/.env`** (or your host’s secret store). Never commit **`.env`**, never put keys in the Vite bundle, and rotate keys if leaked. In CI/CD, inject secrets from protected variables. Provider dashboards may offer API key restrictions — use them when available.

**DDoS and the network edge:** Large-scale **volumetric** or network-layer attacks are not fully mitigated inside Node. Use your **hosting provider’s DDoS protection**, a **CDN/WAF** (e.g. Cloudflare), or a **reverse proxy** with connection/rate limits in front of this app. This repo targets **application-layer** abuse (hammering **`/api/*`**, huge bodies).

**HTTP hardening:** The server registers **`@fastify/helmet`** with **CSP disabled** so the SPA and **SSE** stay compatible; other Helmet defaults still apply. **`TRUST_PROXY=true`** when the app runs behind a proxy so **`req.ip`** matches the real client for rate limiting.

**Transparency:** **`GET /health`** returns `{"ok":true,"usdToInr":...}` — `usdToInr` is the USD→INR rate loaded once at server startup (for estimated Indian-rupee cost in the API and chat UI; `null` if the FX request failed).

## API behavior

All routes are same-origin when you run the unified server (default **`PORT`** **8787**).

| Route | Method | Purpose |
|-------|--------|---------|
| **`/api/chat`** | **POST** | Streaming chat: body **`{ messages: [{ role: "user"\|"assistant", content: string }], stream?: boolean, conversationId?: string }`**. Default **`stream: true`** → **`text/event-stream`** (SSE: `delta`, then `usage` / cost, then `done`). Same rate limit as below. |
| **`/api/plan`** | **POST** | Same request shape and SSE behavior as **`/api/chat`**, but uses the guided **planning** system prompt (wellness coach, actionable steps). Structured logs use **`plan_stream_usage`** / **`plan_completion_usage`** instead of chat. |
| **`/api/reframe`** | **POST** | Same request shape and SSE behavior as **`/api/chat`**, but uses the **Thought challenger** / cognitive reframing system prompt (CBT-style thought record: evidence for and against, balanced perspective). Structured logs use **`reframe_stream_usage`** / **`reframe_completion_usage`**. |
| **`/api/ground`** | **POST** | Same request shape and SSE behavior as **`/api/chat`**, but uses the **micro-intervention coach** prompt (adaptive brief skills—breathing, grounding, relaxation cues, etc.—not diagnosis). Structured logs use **`ground_stream_usage`** / **`ground_completion_usage`**. |
| **`/api/plan/export`** | **POST** | Builds a downloadable document from **client-supplied** transcript JSON (nothing is persisted server-side). Body **`{ title?: string; format?: "markdown" \| "plain"; messages: [...] }`**. Defaults: **`format`** **`plain`** (a simple **`.txt`** file), **`title`** **`Wellness plan`**. Use **`format: "markdown"`** for **`.md`** if needed. Response is **`attachment`** (**`Content-Disposition`**) with **`text/plain`** or **`text/markdown`**. Total character budget per export is capped (see **`MAX_EXPORT_CHARS`** in **`server/src/index.ts`**). Same IP rate limit as chat. |

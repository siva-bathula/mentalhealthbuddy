import type { FastifyBaseLogger } from "fastify";

/** Cached USD→INR rate from public FX API (refreshed once at server startup). */
let cachedInrPerUsd: number | null = null;

const FRANKFURTER = "https://api.frankfurter.app/latest?from=USD&to=INR";

/**
 * Fetches INR per 1 USD. Timeout + catch so startup always completes.
 */
export async function refreshUsdInrAtStartup(
  log?: Pick<FastifyBaseLogger, "debug" | "warn">,
): Promise<void> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(FRANKFURTER, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: { INR?: number } };
    const inr = data.rates?.INR;
    if (typeof inr !== "number" || !Number.isFinite(inr) || inr <= 0) {
      throw new Error("missing or invalid INR rate");
    }
    cachedInrPerUsd = inr;
    log?.debug({ msg: "fx_usd_inr_loaded", usdToInr: inr });
  } catch (e) {
    cachedInrPerUsd = null;
    log?.warn({
      msg: "fx_usd_inr_failed",
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

export function usdToInrRate(): number | null {
  return cachedInrPerUsd;
}

/** Convert estimated USD cost to INR using startup rate; null if rate or cost missing. */
export function usdCostToInr(costUsd: number | null): number | null {
  if (costUsd === null || cachedInrPerUsd === null) return null;
  return costUsd * cachedInrPerUsd;
}

/** Base URL for the chat API (no trailing slash). Empty uses same-origin `/api` (Vite proxy in dev). */
export function chatApiBase(): string {
  const raw = import.meta.env.VITE_CHAT_API_URL as string | undefined;
  return raw?.trim().replace(/\/$/, "") ?? "";
}

/**
 * Full URL for an API path. If `VITE_CHAT_API_URL` ends with `/api` (common misconfiguration),
 * avoid doubling (e.g. base `http://host/api` + path `/api/ground` → `http://host/api/ground`).
 */
export function chatEndpoint(path: string): string {
  const base = chatApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api") && p.startsWith("/api")) {
    return `${base}${p.slice(4)}`;
  }
  return `${base}${p}`;
}

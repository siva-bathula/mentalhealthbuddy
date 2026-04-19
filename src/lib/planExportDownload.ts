import { chatEndpoint } from "../config/api";
import type { ChatMessage } from "../types/chat";

/** Trigger a UTF-8 text download in the browser (same mechanism as server export response). */
export function triggerTextFileDownload(body: string, filename: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([body], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** POST transcript to `/api/plan/export`, download in the browser, return payload for optional local caching. */
export async function downloadPlanDocument(opts: {
  messages: ChatMessage[];
  title?: string;
  format?: "markdown" | "plain";
}): Promise<{ body: string; filename: string }> {
  const res = await fetch(chatEndpoint("/api/plan/export"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: opts.messages.filter((m) => m.role === "user" || m.role === "assistant"),
      title: opts.title?.slice(0, 200),
      format: opts.format ?? "plain",
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(detail.slice(0, 400) || `Export failed (${res.status})`);
  }

  const cd = res.headers.get("Content-Disposition");
  let filename = "wellness-plan.txt";
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^\";]+)["']?/i.exec(cd);
    if (m?.[1]) filename = decodeURIComponent(m[1].trim());
  }

  const blob = await res.blob();
  const body = await blob.text();
  const ct = res.headers.get("Content-Type") ?? "";
  const mime =
    ct.includes("markdown") ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
  triggerTextFileDownload(body, filename, mime);
  return { body, filename };
}

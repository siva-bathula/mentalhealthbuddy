import type { ChatTurn } from "./providers/deepseek.js";

/** Build downloadable plan text from chat turns (client-supplied; not stored server-side). */
export function buildPlanExportDoc(
  format: "markdown" | "plain",
  title: string,
  messages: ChatTurn[],
): { body: string; contentType: string; filenameExt: string } {
  const safeTitle = title.trim() || "Wellness plan";
  const banner =
    "_Educational wellness only—not clinical diagnosis or treatment. Mental Health Buddy._";

  if (format === "plain") {
    const lines: string[] = [safeTitle, "=".repeat(Math.min(safeTitle.length, 72)), ""];
    for (const m of messages) {
      const label = m.role === "user" ? "You" : "Guide";
      lines.push(`${label}:`, m.content, "");
    }
    return {
      body: lines.join("\n"),
      contentType: "text/plain; charset=utf-8",
      filenameExt: "txt",
    };
  }

  let md = `# ${safeTitle}\n\n${banner}\n\n`;
  for (const m of messages) {
    md += m.role === "user" ? `## You\n\n${m.content}\n\n` : `## Guide\n\n${m.content}\n\n`;
  }
  return {
    body: md,
    contentType: "text/markdown; charset=utf-8",
    filenameExt: "md",
  };
}

export function sseData(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export function sseDone(): string {
  return `data: [DONE]\n\n`;
}

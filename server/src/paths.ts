import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (parent of `server/`), resolved from `server/src` or `server/dist`. */
export function getRepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

export function ownedTempDir(): string | undefined {
  const dir = process.env.MIQUEST_E2E_DIR;
  const token = process.env.MIQUEST_E2E_TOKEN;
  if (
    !dir ||
    !token ||
    dirname(dir) !== tmpdir() ||
    !basename(dir).startsWith("miquest-e2e-")
  )
    return;
  try {
    if (readFileSync(join(dir, ".owner"), "utf8") === token) return dir;
  } catch {
    return;
  }
}

import { rmSync } from "node:fs";
import { ownedTempDir } from "./temp";
export default function teardown() {
  const dir = ownedTempDir();
  if (dir) rmSync(dir, { recursive: true, force: true });
}

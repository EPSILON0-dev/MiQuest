import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { ownedTempDir } from "./e2e/temp";
if (!ownedTempDir()) {
  process.env.MIQUEST_E2E_DIR = mkdtempSync(join(tmpdir(), "miquest-e2e-"));
  process.env.MIQUEST_E2E_TOKEN = randomUUID();
  writeFileSync(
    join(process.env.MIQUEST_E2E_DIR, ".owner"),
    process.env.MIQUEST_E2E_TOKEN,
  );
}
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  globalTeardown: "./e2e/teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  webServer: [
    {
      command: "${MIQUEST_PYTHON:-../backend/.venv/bin/python} e2e/server.py",
      url: "http://127.0.0.1:18080/readyz",
      reuseExistingServer: false,
      env: { ...process.env, PYTHONPATH: "../backend" } as Record<
        string,
        string
      >,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      env: {
        ...process.env,
        MIQUEST_BACKEND_URL: "http://127.0.0.1:18080",
      } as Record<string, string>,
    },
  ],
});

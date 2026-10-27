import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:8001",
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command:
      "../.venv/bin/python -m uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8001",
    url: "http://127.0.0.1:8001/api/health",
    env: {
      DATABASE_PATH: join(tmpdir(), `insightpilot-e2e-${randomUUID()}.db`),
      OPENAI_API_KEY: "",
    },
    reuseExistingServer: false,
  },
  reporter: "list",
});

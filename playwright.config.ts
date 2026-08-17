import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5178",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: [
    {
      command: "npm run start:api",
      url: "http://127.0.0.1:8787/api/health",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5178",
      url: "http://127.0.0.1:5178/widget",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
  ],
});

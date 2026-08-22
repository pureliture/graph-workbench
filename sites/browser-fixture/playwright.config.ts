import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // WebGL scene setup is deterministic, but headless Chromium can defer its
  // first renderer frames substantially on a busy local runner.
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? "github" : "list",
  outputDir: "test-results",
  use: {
    baseURL: "http://[::1]:4173",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --host ::1 --port 4173",
    url: "http://[::1]:4173",
    reuseExistingServer: false,
    stdout: "ignore",
    timeout: 120_000,
  },
});

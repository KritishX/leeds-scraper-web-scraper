import { defineConfig } from "@playwright/test";

// Runs against the production build (npm run build) served by the real app;
// see tests/e2e/server.mjs for the fixture fetcher.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4189", trace: "retain-on-failure" },
  webServer: {
    command: "node tests/e2e/server.mjs",
    url: "http://127.0.0.1:4189/api/health",
    reuseExistingServer: false,
  },
});

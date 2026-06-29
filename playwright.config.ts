import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 8081);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const apiURL = process.env.E2E_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: process.env.E2E_SKIP_WEB_SERVER === "1" ? undefined : {
    command: `EXPO_PUBLIC_API_URL=${apiURL} pnpm --filter @blex/mobile run web -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-web",
      use: { ...devices["iPhone 15 Pro"], browserName: "chromium" }
    }
  ]
});

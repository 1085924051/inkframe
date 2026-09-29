import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    locale: "zh-CN",
  },
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL: "file:./e2e.db" },
  },
});
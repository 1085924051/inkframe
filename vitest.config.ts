import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    env: { DATABASE_URL: "file:./test.db" },
    fileParallelism: false,
    globalSetup: "./test/global-setup.ts",
  },
});
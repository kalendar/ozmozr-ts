import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 15000,
  },
});

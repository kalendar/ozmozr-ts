import { defineConfig } from "@playwright/test";

const PORT = 3100;
const E2E_DATABASE_URL = process.env.DATABASE_URL_E2E ?? "postgres://localhost:5432/ozmozr_e2e";

// E2E_PROD=1 runs against the production build (run `npm run build` first). Specs that
// need a local fixture server cannot run that way: production refuses private addresses.
const prod = process.env.E2E_PROD === "1";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx tsx e2e/reset-db.ts && npx next ${prod ? "start" : "dev"} -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e",
      OZMOZR_ALLOW_PRIVATE_FETCH: "1",
      OZMOZR_RATE_LIMITS: "off",
      UPLOAD_DIR: "./.e2e-uploads",
    },
  },
});

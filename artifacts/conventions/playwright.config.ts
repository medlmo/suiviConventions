import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) {
  throw new Error("E2E_BASE_URL est défini par la commande pnpm run test:e2e.");
}
const outputDir = process.env.E2E_OUTPUT_DIR;
if (!outputDir) {
  throw new Error("E2E_OUTPUT_DIR est défini par la commande pnpm run test:e2e.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  outputDir,
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    launchOptions: process.env.E2E_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE }
      : {},
    trace: "retain-on-failure",
  },
});

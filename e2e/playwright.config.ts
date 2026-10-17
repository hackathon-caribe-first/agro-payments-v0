import { defineConfig, devices } from "@playwright/test";

const demo = process.env.DEMO_MODE === "1";
const live = process.env.DEMO_BASE_URL ?? "https://surco-caribe-first-web.onrender.com";
const mock = process.env.DEMO_MOCK_URL ?? "http://127.0.0.1:5175";
const delay = Number(process.env.DEMO_SLOWMO ?? (demo ? 650 : 0));
export default defineConfig({
  testDir: "./scenarios",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "artifacts/report", open: "never" }]],
  outputDir: "artifacts/results",
  use: {
    ...devices["Desktop Chrome"],
    headless: !demo,
    launchOptions: { slowMo: delay },
    trace: "retain-on-failure",
    video: "on",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 35_000,
  },
  projects: [
    { name: "smoke", testMatch: /smoke\.spec\.ts$/, use: { baseURL: live } },
    { name: "demo", testIgnore: /smoke\.spec\.ts$/, use: { baseURL: mock } },
  ],
});

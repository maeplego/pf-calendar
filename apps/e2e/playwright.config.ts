import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const apiPort = 18095;
const webPort = 13005;
const api = `http://localhost:${apiPort}`;
const web = `http://localhost:${webPort}`;
const root = path.join(__dirname, "..", "..");

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: web,
    trace: "off",
  },
  webServer: [
    {
      command: "npx tsx src/index.ts",
      cwd: path.join(root, "apps", "api"),
      url: `${api}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        CALENDAR_HTTP_PORT: String(apiPort),
        CALENDAR_DATABASE_URL: "",
        CALENDAR_DEV_AUTH: "true",
        CALENDAR_CORS_ORIGIN: web,
      },
    },
    {
      command: "npx next dev -p 13005 --hostname localhost",
      cwd: path.join(root, "apps", "web"),
      url: web,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        CALENDAR_API_URL: api,
        NEXT_PUBLIC_CALENDAR_API_URL: api,
      },
    },
  ],
});

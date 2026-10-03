import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const systemBrowserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  process.env.ProgramFiles
    ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
    : undefined,
  process.env["PROGRAMFILES(X86)"]
    ? path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe")
    : undefined,
].filter((candidate): candidate is string => Boolean(candidate));

const systemBrowserExecutable = systemBrowserCandidates.find((candidate) => existsSync(candidate));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: systemBrowserExecutable ? { executablePath: systemBrowserExecutable } : undefined,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

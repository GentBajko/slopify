import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "app",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    passWithNoTests: true,
    // Shared Windows runners are several times slower at SQLite, process and file work, and a
    // different handful of integration cases crossed the default five seconds on each run. Linux
    // keeps the default, so a genuinely slow test still shows up there.
    ...(process.platform === "win32" ? { testTimeout: 30_000, hookTimeout: 30_000 } : {}),
  },
});

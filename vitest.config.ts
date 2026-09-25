import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./vitest.tmpdir.ts"],
    passWithNoTests: true,
    projects: ["./packages/*/vitest.config.ts"],
  },
});

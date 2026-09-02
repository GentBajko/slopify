import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "app",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    passWithNoTests: true,
  },
});

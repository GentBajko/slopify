import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    passWithNoTests: true,
  },
});

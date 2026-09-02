import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "collector",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { aliases } from "./aliases.ts";

export default defineConfig({
  resolve: { alias: aliases(fileURLToPath(new URL(".", import.meta.url))) },
  test: {
    name: "web",
    environment: "happy-dom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    passWithNoTests: true,
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "site",
    include: ["*.test.js"],
  },
});

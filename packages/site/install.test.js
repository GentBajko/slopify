import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const page = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");

it("offers a copyable Docker launcher and a localhost-only direct command", () => {
  expect(page).toContain('data-copy="npx @gentbajko/slopify@latest --docker"');
  expect(page).toContain(
    'data-copy="docker run -d --name slopify --restart always -p 127.0.0.1:6969:6969 -v slopify-data:/data ghcr.io/gentbajko/slopify:latest"',
  );
  expect(page).toContain("Linux");
  expect(page).toContain("Sign in to the CLIs inside the container");
});

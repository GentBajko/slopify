import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const page = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");

it("explains automatic host project files, API-only access and safe recovery", () => {
  expect(page).toContain("~/Slopify/Projects");
  expect(page).toContain("--projects-dir");
  expect(page).toContain("SLOPIFY_DOCKER_PROJECTS_DIR");
  expect(page).toContain("database and credentials stay private");
  expect(page).toContain("machine running Slopify");
  expect(page).toContain("does not set up a host project folder");
});

it("offers a copyable Docker launcher and a localhost-only direct command", () => {
  expect(page).toContain('data-copy="npx @gentbajko/slopify@latest --docker"');
  expect(page).toContain(
    'data-copy="docker run -d --name slopify --restart always -p 127.0.0.1:6969:6969 -v slopify-data:/data ghcr.io/gentbajko/slopify:latest"',
  );
  expect(page).toContain("Linux");
  expect(page).toContain("systemd");
  expect(page).toContain("asks once");
  expect(page).toContain("logins stay on the host");
  expect(page).toContain("API-only");
  expect(page).not.toContain("Sign in to the CLIs inside the container");
});

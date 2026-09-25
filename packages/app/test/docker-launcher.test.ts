import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { assertManagedDockerHost } from "../src/edge/docker.js";

it("keeps the packaged shell entry small and forwards to the emitted launcher", async () => {
  const shell = await readFile(new URL("../scripts/docker-run.sh", import.meta.url), "utf8");
  expect(shell).toContain(
    `exec node "$(dirname -- "\${BASH_SOURCE[0]}")/../dist/edge/docker-launch.js"`,
  );
  expect(shell).not.toContain("docker run");
});
it("rejects unsupported managed hosts before helper or storage mutation", () => {
  expect(() => assertManagedDockerHost("win32", 1000, 1000)).toThrow("Linux");
  expect(() => assertManagedDockerHost("linux", 0, 0)).toThrow("sudo");
  expect(() => assertManagedDockerHost("linux", 1000, 1000)).not.toThrow();
});

import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { assertManagedDockerHost } from "../src/edge/docker.js";

it("rejects unsupported managed hosts before helper or storage mutation", () => {
  expect(() => assertManagedDockerHost("win32", 1000, 1000)).toThrow("Linux");
  expect(() => assertManagedDockerHost("linux", 0, 0)).toThrow("sudo");
  expect(() => assertManagedDockerHost("linux", 1000, 1000)).not.toThrow();
});

it("ships one compose file: localhost port, external data volume, bridge and handshake mounts", async () => {
  const compose = parse(await readFile(new URL("../../../compose.yaml", import.meta.url), "utf8"));
  const service = compose.services.slopify;
  expect(Object.keys(compose.services)).toEqual(["slopify"]);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: compose's own variable syntax
  expect(service.ports).toEqual(["127.0.0.1:${SLOPIFY_PORT-6969}:6969"]);
  expect(service.restart).toBe("unless-stopped");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: compose's own variable syntax
  expect(compose.volumes.data).toEqual({ external: true, name: "${SLOPIFY_VOLUME:-slopify-data}" });
  expect(service.volumes.map((v: { target: string }) => v.target)).toEqual([
    "/data",
    "/data/projects",
    "/opt/slopify-host",
    "/opt/slopify-install",
  ]);
  expect(service.environment.SLOPIFY_DOCKER_INSTALL_STATE).toBe(
    "/opt/slopify-install/activation.json",
  );
});

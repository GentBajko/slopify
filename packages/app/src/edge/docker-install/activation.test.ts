import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { dockerActivationCommitted, dockerFolderConfiguration } from "./activation.js";
import { writeState } from "./state.js";

it("activates only the exact committed transaction token", async () => {
  const root = await mkdtemp(join(tmpdir(), "slopify-activation-"));
  try {
    const path = join(root, "activation.json");
    const token = "a".repeat(64);
    expect(await dockerActivationCommitted(path, token)).toBe(false);
    await writeState(path, { version: 1, token, committed: false });
    expect(await dockerActivationCommitted(path, token)).toBe(false);
    await writeState(path, { version: 1, token, committed: true });
    expect(await dockerActivationCommitted(path, "b".repeat(64))).toBe(false);
    expect(await dockerActivationCommitted(path, token)).toBe(true);
    await writeState(path, { version: 2, token, committed: true });
    await expect(dockerActivationCommitted(path, token)).rejects.toThrow();
    expect(await dockerFolderConfiguration({}, root)).toEqual({
      container: false,
      hostProjects: null,
    });
    expect(await dockerFolderConfiguration({ SLOPIFY_CONTAINER: "1" }, root)).toEqual({
      container: true,
      hostProjects: null,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

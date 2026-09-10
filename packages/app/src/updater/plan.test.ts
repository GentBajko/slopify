import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  activateUpdate,
  activeUpdateEntry,
  installDirectory,
  installedEntry,
  updateCommitted,
} from "./plan.js";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture(version: string) {
  const root = await mkdtemp(join(tmpdir(), "slopify-update-plan-"));
  directories.push(root);
  const packageDir = join(installDirectory(root, version), "node_modules", "@gentbajko", "slopify");
  const entry = join(packageDir, "dist", "edge", "cli.js");
  await mkdir(join(packageDir, "dist", "edge"), { recursive: true });
  await writeFile(
    join(packageDir, "package.json"),
    JSON.stringify({ name: "@gentbajko/slopify", version }),
  );
  await writeFile(entry, "// fixture");
  return { root, packageDir, entry };
}
it("forwards an older global or npx install only to a verified, newer managed package", async () => {
  const f = await fixture("0.6.2");
  expect(await activeUpdateEntry(f.root, "0.6.1")).toBeUndefined();
  await activateUpdate(f.root, "0.6.2", "a".repeat(64));
  expect(await activeUpdateEntry(f.root, "0.6.1")).toBe(f.entry);
  expect(await activeUpdateEntry(f.root, "0.6.2")).toBeUndefined();
  expect(await activeUpdateEntry(f.root, "0.7.0")).toBeUndefined();
  expect(JSON.parse(await readFile(join(f.root, "updates", "current.json"), "utf8"))).toEqual({
    version: "0.6.2",
    token: "a".repeat(64),
  });
});
it("keeps the original launcher usable when the managed install is missing or mismatched", async () => {
  const f = await fixture("0.6.2");
  await activateUpdate(f.root, "0.6.2", "a".repeat(64));
  await writeFile(
    join(f.packageDir, "package.json"),
    JSON.stringify({ name: "another-package", version: "0.6.2" }),
  );
  expect(await activeUpdateEntry(f.root, "0.6.1")).toBeUndefined();
  await expect(installedEntry(f.root, "0.6.2")).rejects.toThrow();
});
it("does not use a path or arbitrary package from a corrupt managed pointer", async () => {
  const f = await fixture("0.6.2");
  for (const pointer of [
    { version: "../../other" },
    { version: "0.6.2-beta" },
    { path: f.entry },
  ]) {
    await writeFile(join(f.root, "updates", "current.json"), JSON.stringify(pointer));
    expect(await activeUpdateEntry(f.root, "0.6.1")).toBeUndefined();
  }
});

it("requires both the candidate version and private token in the atomic activation marker", async () => {
  const f = await fixture("0.6.2");
  const token = "a".repeat(64);
  expect(await updateCommitted(f.root, "0.6.2", token)).toBe(false);
  await activateUpdate(f.root, "0.6.2", token);
  expect(await updateCommitted(f.root, "0.6.2", token)).toBe(true);
  expect(await updateCommitted(f.root, "0.6.2", "b".repeat(64))).toBe(false);
  expect(await updateCommitted(f.root, "0.6.1", token)).toBe(false);
});

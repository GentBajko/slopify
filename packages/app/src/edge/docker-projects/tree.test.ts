import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { assertIdentity, identity, safePath, treeDigest } from "./tree.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "slopify-tree-"));
  roots.push(root);
  return { root, home: root, state: join(root, "private"), projects: join(root, "Projects") };
}
it("hashes every relative name, empty directory, size and byte without a 64KiB manifest limit", async () => {
  const h = await fixture();
  await mkdir(h.projects);
  await mkdir(join(h.projects, "empty"));
  for (let i = 0; i < 1200; i++)
    await writeFile(join(h.projects, `research-${i}-é.md`), `saved ${i}`);
  const first = await treeDigest(h.projects);
  expect(first.files).toBe(1200);
  await writeFile(join(h.projects, "research-0-é.md"), "saved X");
  expect((await treeDigest(h.projects)).hash).not.toBe(first.hash);
  await writeFile(join(h.projects, "research-0-é.md"), "saved 0");
  expect(await treeDigest(h.projects)).toEqual(first);
  await rm(join(h.projects, "empty"), { recursive: true });
  expect((await treeDigest(h.projects)).hash).not.toBe(first.hash);
});
it("rejects symlinks in the tree and in destination ancestors", async () => {
  const h = await fixture();
  await mkdir(h.projects);
  await writeFile(join(h.root, "outside"), "unchanged");
  await symlink(join(h.root, "outside"), join(h.projects, "link"));
  await expect(treeDigest(h.projects)).rejects.toThrow("Unsafe project entry");
  await symlink(h.projects, join(h.root, "alias"));
  await expect(safePath(join(h.root, "alias", "new"), h.home, h.state, true)).rejects.toThrow();
  expect(await readFile(join(h.root, "outside"), "utf8")).toBe("unchanged");
});
it("rejects broad/private paths, detects a replaced directory and permits spaces", async () => {
  const h = await fixture();
  for (const path of ["/", h.home, h.state, join(h.state, "child"), "/etc/projects"])
    await expect(safePath(path, h.home, h.state, false)).rejects.toThrow();
  const path = join(h.home, "Slopify files", "Projects");
  await safePath(path, h.home, h.state, true);
  await mkdir(path, { mode: 0o700 });
  const before = await identity(path);
  await assertIdentity(path, before);
  await (await import("node:fs/promises")).rename(path, `${path}-original`);
  await mkdir(path);
  await expect(assertIdentity(path, before)).rejects.toThrow("identity");
});
it.skipIf(process.platform !== "linux")("refuses special files without opening them", async () => {
  const h = await fixture();
  await mkdir(h.projects);
  const { execFileSync } = await import("node:child_process");
  execFileSync("mkfifo", [join(h.projects, "fifo")]);
  await expect(treeDigest(h.projects)).rejects.toThrow("Unsafe project entry");
  await rm(join(h.projects, "fifo"));
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(join(h.projects, "socket"), resolve);
  });
  try {
    await expect(treeDigest(h.projects)).rejects.toThrow("Unsafe project entry");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

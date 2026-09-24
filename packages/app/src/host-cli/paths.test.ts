import { chmod, lstat, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ensureBridgeToken, prepareHostPaths, readBridgeToken } from "./paths.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function root() {
  const path = await mkdtemp(join(tmpdir(), "sb-"));
  roots.push(path);
  return path;
}
it.skipIf(process.platform === "win32")(
  "keeps host root private while supporting another container UID",
  async () => {
    const paths = await prepareHostPaths(await root());
    const token = await ensureBridgeToken(paths.tokenFile);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await readBridgeToken(paths.tokenFile)).toBe(token);
    expect(await ensureBridgeToken(paths.tokenFile)).toBe(token);
    expect((await lstat(paths.root)).mode & 0o777).toBe(0o700);
    expect((await lstat(paths.share)).mode & 0o777).toBe(0o755);
    expect((await lstat(paths.tokenFile)).mode & 0o777).toBe(0o644);
  },
);
it.skipIf(process.platform === "win32")("refuses symlinked roots, exports and tokens", async () => {
  const directory = await root();
  await symlink(directory, join(directory, "alias"));
  await expect(prepareHostPaths(join(directory, "alias"))).rejects.toThrow("Unsafe");
  await symlink(directory, join(directory, "share"));
  await expect(prepareHostPaths(directory)).rejects.toThrow("Unsafe");
  await expect(readBridgeToken(join(directory, "alias"))).rejects.toThrow();
});
it("rejects long socket paths before creating directories and malformed tokens", async () => {
  await expect(prepareHostPaths(`/tmp/${"x".repeat(101)}`)).rejects.toThrow("shorter");
  const paths = await prepareHostPaths(await root());
  await writeFile(paths.tokenFile, "wrong", { mode: 0o644 });
  await expect(readBridgeToken(paths.tokenFile)).rejects.toThrow("token");
  await chmod(paths.tokenFile, 0o666);
  await expect(ensureBridgeToken(paths.tokenFile)).rejects.toThrow();
});

import { execFileSync } from "node:child_process";
import { chmod, lchown, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMissing, syncDirectory, treeDigest } from "./tree.js";

export async function volumeOperation(args: readonly string[]): Promise<unknown> {
  const [operation, user = "0:0"] = args;
  if (operation === "projects") {
    const present = await lstat("/source/projects").catch((e: unknown) => {
      if (isMissing(e)) return null;
      throw e;
    });
    if (present === null) return { exists: false };
    return { exists: true, digest: await treeDigest("/source/projects") };
  }
  if (operation === "private") return treeDigest("/source", true, true);
  if (operation === "snapshot") {
    if ((await readdir("/backup")).length !== 0) throw new Error("Recovery volume is not empty.");
    const before = await treeDigest("/source", true);
    execFileSync("cp", ["-a", "/source/.", "/backup/"], { stdio: "pipe" });
    const copied = await treeDigest("/backup", true);
    const after = await treeDigest("/source", true);
    if (before.hash !== copied.hash || before.hash !== after.hash)
      throw new Error("Private snapshot verification failed.");
    execFileSync("sync", ["-f", "/backup"], { stdio: "pipe" });
    await syncDirectory("/backup");
    return treeDigest("/backup", true, true);
  }
  if (operation === "restore") {
    const source = await treeDigest("/source", true, true);
    for (const name of await readdir("/data")) {
      if (name !== "projects") await rm(join("/data", name), { recursive: true, force: true });
    }
    for (const name of await readdir("/source")) {
      if (name !== "projects")
        execFileSync("cp", ["-a", "--", join("/source", name), "/data/"], { stdio: "pipe" });
    }
    const root = await lstat("/source");
    await lchown("/data", root.uid, root.gid);
    await chmod("/data", root.mode & 0o7777);
    execFileSync("sync", ["-f", "/data"], { stdio: "pipe" });
    await syncDirectory("/data");
    const restored = await treeDigest("/data", true, true);
    if (source.hash !== restored.hash)
      throw new Error("Private volume restore verification failed.");
    return restored;
  }
  if (!/^\d+:\d+$/.test(user)) throw new Error("Invalid container owner.");
  const [uid, gid] = user.split(":").map(Number);
  if (uid === undefined || gid === undefined) throw new Error("Missing container owner.");
  if (operation === "own") {
    const owner = { uid, gid };
    async function own(path: string): Promise<void> {
      const s = await lstat(path);
      if (!s.isDirectory() && !s.isFile() && !s.isSymbolicLink())
        throw new Error("Unsupported private-volume entry.");
      await lchown(path, owner.uid, owner.gid);
      if (s.isSymbolicLink()) return;
      await chmod(path, s.isDirectory() ? 0o700 : 0o600 | (s.mode & 0o100));
      if (s.isDirectory()) {
        for (const name of await readdir(path)) {
          if (path === "/data" && name === "projects") continue;
          await own(join(path, name));
        }
      }
    }
    await own("/data");
    await mkdir("/data/home", { recursive: true, mode: 0o700 });
    await lchown("/data/home", uid, gid);
    return { ok: true };
  }
  if (operation === "probe") {
    await writeFile("/probe/container", "slopify ownership probe", { flag: "wx", mode: 0o600 });
    return { uid: process.getuid?.(), gid: process.getgid?.() };
  }
  throw new Error("Unknown fixed Docker volume operation.");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await volumeOperation(process.argv.slice(2))));
  } catch {
    console.error("Docker volume operation failed; original recovery material is retained.");
    process.exitCode = 1;
  }
}

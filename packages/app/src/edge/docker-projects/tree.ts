import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lchown, lstat, mkdir, open, readdir, readlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export interface Identity {
  readonly dev: string;
  readonly ino: string;
}
export interface Digest {
  readonly hash: string;
  readonly files: number;
  readonly bytes: number;
}
export async function identity(path: string): Promise<Identity> {
  const s = await lstat(path, { bigint: true });
  if (!s.isDirectory() || s.isSymbolicLink()) throw new Error("Unsafe directory identity.");
  return { dev: String(s.dev), ino: String(s.ino) };
}
export async function assertIdentity(path: string, expected: Identity): Promise<void> {
  const actual = await identity(path);
  if (actual.dev !== expected.dev || actual.ino !== expected.ino)
    throw new Error(`Directory identity changed: ${path}`);
}
export function contains(root: string, path: string): boolean {
  const r = relative(root, path);
  return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r));
}
export async function safePath(
  path: string,
  home: string,
  stateRoot: string,
  createParents: boolean,
): Promise<void> {
  if (!isAbsolute(path) || resolve(path) !== path || /[\p{Cc},]/u.test(path))
    throw new Error(
      "Project directory must be a normal absolute path without commas/control characters.",
    );
  const forbidden = [
    "/",
    "/home",
    "/root",
    "/tmp",
    "/var",
    "/srv",
    "/mnt",
    "/media",
    home,
    join(home, "Slopify"),
  ];
  if (
    forbidden.includes(path) ||
    contains(stateRoot, path) ||
    contains(path, stateRoot) ||
    ["/proc", "/sys", "/dev", "/etc", "/usr", "/bin", "/sbin", "/lib", "/var/lib/docker"].some(
      (p) => contains(p, path),
    )
  )
    throw new Error("Unsafe broad or private project directory.");
  const parts = path.split(sep).filter(Boolean);
  let current: string = sep;
  for (const [i, part] of parts.entries()) {
    current = join(current, part);
    let s = await lstat(current).catch((error: unknown) => {
      if (isMissing(error)) return undefined;
      throw error;
    });
    if (s === undefined && i < parts.length - 1 && createParents) {
      await mkdir(current, { mode: 0o700 });
      s = await lstat(current);
    }
    if (s === undefined) continue;
    if (!s.isDirectory() || s.isSymbolicLink())
      throw new Error(`Unsafe path component: ${current}`);
    if (i === parts.length - 1 && (s.uid !== process.getuid?.() || (s.mode & 0o022) !== 0))
      throw new Error(
        "Project directory must belong to the installing user and must not be publicly writable.",
      );
    if (i < parts.length - 1 && (s.mode & 0o022) !== 0 && (s.mode & 0o1000) === 0)
      throw new Error(`Writable project ancestor: ${current}`);
  }
}
export function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
export async function syncDirectory(path: string): Promise<void> {
  const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    await fd.sync();
  } finally {
    await fd.close();
  }
}
export async function treeDigest(
  root: string,
  metadata: boolean = false,
  omitProjects: boolean = false,
): Promise<Digest> {
  const hash = createHash("sha256");
  let files = 0;
  let bytes = 0;
  async function walk(path: string, name: string): Promise<void> {
    const before = await lstat(path, { bigint: true });
    const meta = metadata
      ? [String(before.uid), String(before.gid), Number(before.mode & 0o7777n)]
      : [];
    if (before.isDirectory()) {
      hash.update(`${JSON.stringify([name, "directory", ...meta])}\n`);
      for (const entry of (await readdir(path)).sort()) {
        if (omitProjects && name === "" && entry === "projects") continue;
        await walk(join(path, entry), name === "" ? entry : `${name}/${entry}`);
      }
    } else if (before.isSymbolicLink() && metadata) {
      hash.update(`${JSON.stringify([name, "symlink", await readlink(path), ...meta])}\n`);
    } else if (before.isFile() && (metadata || before.nlink === 1n)) {
      const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const content = createHash("sha256");
      try {
        const opened = await fd.stat({ bigint: true });
        if (opened.dev !== before.dev || opened.ino !== before.ino)
          throw new Error("Source changed during verification.");
        const buffer = Buffer.alloc(1024 * 1024);
        let length = 0;
        for (;;) {
          const result = await fd.read(buffer, 0, buffer.length, null);
          if (result.bytesRead === 0) break;
          length += result.bytesRead;
          content.update(buffer.subarray(0, result.bytesRead));
        }
        const after = await fd.stat({ bigint: true });
        if (
          after.size !== before.size ||
          after.mtimeNs !== before.mtimeNs ||
          BigInt(length) !== before.size
        )
          throw new Error("Source changed during verification.");
        files++;
        bytes += length;
        hash.update(`${JSON.stringify([name, "file", length, content.digest("hex"), ...meta])}\n`);
      } finally {
        await fd.close();
      }
    } else throw new Error(`Unsafe project entry: ${name}`);
    const after = await lstat(path, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino || after.mtimeNs !== before.mtimeNs)
      throw new Error("Source changed during verification.");
  }
  await walk(root, "");
  return { hash: hash.digest("hex"), files, bytes };
}
export async function assertWritableTree(root: string, uid: number): Promise<void> {
  const s = await lstat(root);
  if (
    s.isSymbolicLink() ||
    (!s.isDirectory() && !s.isFile()) ||
    (s.isFile() && s.nlink !== 1) ||
    s.uid !== uid ||
    (s.mode & (s.isDirectory() ? 0o700 : 0o600)) !== (s.isDirectory() ? 0o700 : 0o600)
  )
    throw new Error(`Existing project permissions are incompatible with this host user: ${root}`);
  if (s.isDirectory())
    for (const name of await readdir(root)) await assertWritableTree(join(root, name), uid);
}

export async function privateTree(root: string, uid: number, gid: number): Promise<void> {
  async function visit(path: string): Promise<void> {
    const s = await lstat(path);
    if (s.isSymbolicLink() || (!s.isDirectory() && !s.isFile()) || (s.isFile() && s.nlink !== 1))
      throw new Error("Unsafe project entry during ownership setup.");
    if (s.uid !== uid || s.gid !== gid) await lchown(path, uid, gid);
    await chmod(path, s.isDirectory() ? 0o700 : 0o600);
    if (s.isDirectory()) {
      for (const name of await readdir(path)) await visit(join(path, name));
      await syncDirectory(path);
    } else {
      const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        await fd.sync();
      } finally {
        await fd.close();
      }
    }
  }
  await visit(root);
  await syncDirectory(dirname(root));
}

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupFileName,
  isBackupFileName,
  listBackups,
  pruneBackups,
  removeLeftovers,
  writeAtomically,
} from "./files.js";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function folder(): string {
  const path = mkdtempSync(join(tmpdir(), "slopify-auto-backup-"));
  folders.push(path);
  return path;
}

async function* chunks(parts: readonly string[], failAfter?: number): AsyncGenerator<Uint8Array> {
  for (const [index, part] of parts.entries()) {
    if (failAfter !== undefined && index === failAfter) throw new Error("disk went away");
    yield new TextEncoder().encode(part);
  }
}

describe("backup file names", () => {
  it("are recognised only in their exact form", () => {
    const name = backupFileName(new Date("2026-09-27T03:00:05.123Z"));
    expect(name).toBe("slopify-backup-2026-09-27T030005Z.tar");
    expect(isBackupFileName(name)).toBe(true);
    for (const other of [
      "slopify-backup-2026-09-27.tar", // an Export everything download
      "slopify-backup-2026-09-27T030005Z.tar.partial",
      "my-slopify-backup-2026-09-27T030005Z.tar",
      "slopify-backup-2026-09-27T030005Z (1).tar",
      "notes.txt",
    ])
      expect(isBackupFileName(other)).toBe(false);
  });
});

describe("writeAtomically", () => {
  it("writes under a hidden name and renames only when complete", async () => {
    const dir = folder();
    const name = backupFileName(new Date("2026-09-27T03:00:00.000Z"));
    const written = await writeAtomically(dir, name, chunks(["abc", "def"]));
    expect(written).toEqual({ path: join(dir, name), bytes: 6 });
    expect(readFileSync(written.path, "utf8")).toBe("abcdef");
    expect(readdirSync(dir)).toEqual([name]);
  });

  it("leaves no file behind, final or partial, when writing fails", async () => {
    const dir = folder();
    const name = backupFileName(new Date("2026-09-27T03:00:00.000Z"));
    await expect(writeAtomically(dir, name, chunks(["abc", "def"], 1))).rejects.toThrow(
      "disk went away",
    );
    expect(readdirSync(dir)).toEqual([]);
    expect(await listBackups(dir)).toEqual([]);
  });

  it("stops and cleans up when aborted", async () => {
    const dir = folder();
    const abort = new AbortController();
    abort.abort(new Error("stopping"));
    await expect(
      writeAtomically(
        dir,
        backupFileName(new Date("2026-09-27T03:00:00.000Z")),
        chunks(["abc"]),
        abort.signal,
      ),
    ).rejects.toThrow("stopping");
    expect(readdirSync(dir)).toEqual([]);
  });

  it("never overwrites an existing backup", async () => {
    const dir = folder();
    const name = backupFileName(new Date("2026-09-27T03:00:00.000Z"));
    writeFileSync(join(dir, name), "old");
    await expect(writeAtomically(dir, name, chunks(["new"]))).rejects.toThrow("already exists");
    expect(readFileSync(join(dir, name), "utf8")).toBe("old");
  });
});

describe("pruneBackups", () => {
  it("keeps the newest N of its own files and ignores everything else", async () => {
    const dir = folder();
    const ours = [1, 2, 3, 4, 5, 6, 7].map((day) =>
      backupFileName(new Date(`2026-09-0${day}T03:00:00.000Z`)),
    );
    // Written newest first, so an mtime-based order would get it wrong.
    for (const name of ours.toReversed()) writeFileSync(join(dir, name), "x");
    const foreign = [
      "slopify-backup-2026-09-01.tar",
      "holiday.mp4",
      "slopify-backup-2026-08-01T030000Z.tar.bak",
    ];
    for (const name of foreign) writeFileSync(join(dir, name), "keep me");
    mkdirSync(join(dir, backupFileName(new Date("2026-08-01T03:00:00.000Z"))));
    symlinkSync(
      join(dir, "holiday.mp4"),
      join(dir, backupFileName(new Date("2026-08-02T03:00:00.000Z"))),
    );

    const removed = await pruneBackups(dir, 3);

    expect(removed).toEqual(ours.slice(0, 4));
    expect((await listBackups(dir)).map((file) => file.name)).toEqual(ours.slice(4));
    for (const name of foreign) expect(existsSync(join(dir, name))).toBe(true);
    expect(readdirSync(dir)).toContain(backupFileName(new Date("2026-08-01T03:00:00.000Z")));
    expect(readdirSync(dir)).toContain(backupFileName(new Date("2026-08-02T03:00:00.000Z")));
  });

  it("keeps at least one", async () => {
    const dir = folder();
    const name = backupFileName(new Date("2026-09-01T03:00:00.000Z"));
    writeFileSync(join(dir, name), "x");
    expect(await pruneBackups(dir, 0)).toEqual([]);
  });
});

describe("removeLeftovers", () => {
  it("removes only this feature's partial files", async () => {
    const dir = folder();
    writeFileSync(join(dir, ".slopify-backup-2026-09-27T030000Z.tar.partial"), "x");
    writeFileSync(join(dir, ".other.partial"), "x");
    expect(await removeLeftovers(dir)).toBe(1);
    expect(readdirSync(dir)).toEqual([".other.partial"]);
  });
});

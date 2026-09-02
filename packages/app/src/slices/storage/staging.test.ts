import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { EmitStaging, StagingEvent } from "./model.js";
import { outputsOf, stagedFileById, stagedFiles } from "./repo.js";
import type { StorageDeps } from "./staging.js";
import { attachStagedFile, discardStagedFile, stageUpload } from "./staging.js";

interface Harness {
  readonly deps: StorageDeps;
  readonly events: StagingEvent[];
  readonly lines: string[];
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-staging-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(join(paths.dataDir, "test.db"));
  let ticks = 0;
  const clock: Clock = {
    now: (): Date => {
      ticks += 1;
      return new Date(Date.UTC(2026, 8, 2, 10, 0, ticks));
    },
  };
  migrate(db, clock);
  db.exec("INSERT INTO projects VALUES ('p1','Hello World','16:9','{}','2026-09-01','2026-09-01')");
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${n}`;
    },
  };
  const events: StagingEvent[] = [];
  const lines: string[] = [];
  const log: Log = {
    write: (level: LogLevel, event: string, fields?: LogFields): void => {
      lines.push(`${level} ${event} ${fields?.detail ?? ""}`);
    },
  };
  const emit: EmitStaging = (event: StagingEvent): void => {
    events.push(event);
  };
  return { deps: { db, paths, ids, clock, log, emit }, events, lines };
}

async function* chunks(...parts: readonly string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) {
    yield Buffer.from(part);
  }
}

async function* failing(): AsyncGenerator<Uint8Array> {
  yield Buffer.from("half a file");
  throw new Error("socket hung up");
}

describe("stageUpload", () => {
  it("streams the bytes to a staging file named by a generated id", async () => {
    const { deps, events } = harness();

    const result = await stageUpload(deps, {
      stageKind: "audio",
      originalFilename: "Take One.MP3",
      content: chunks("hello ", "world"),
    });

    expect(result).toEqual({
      ok: true,
      file: {
        id: "id1",
        stageKind: "audio",
        path: "id1",
        originalFilename: "Take One.MP3",
        bytes: 11,
        state: "staged",
        createdAt: "2026-09-02T10:00:02.000Z",
      },
    });
    expect(readFileSync(join(deps.paths.staging, "id1"), "utf8")).toBe("hello world");
    expect(stagedFileById(deps.db, "id1")?.state).toBe("staged");
    expect(events.at(-1)).toEqual({
      type: "staging.progress",
      stagedFileId: "id1",
      stageKind: "audio",
      originalFilename: "Take One.MP3",
      bytes: 11,
      state: "staged",
    });
  });

  it("reports the bytes that have landed while the copy is still running", async () => {
    const { deps, events } = harness();

    await stageUpload(deps, {
      stageKind: "images",
      originalFilename: "shot.png",
      content: chunks("aaaa", "bbbb", "cccc"),
    });

    expect(events.filter((event) => event.type === "staging.progress").map((e) => e.bytes)).toEqual(
      [4, 8, 12, 12],
    );
  });

  it("refuses a filename that carries a path", async () => {
    const { deps } = harness();

    for (const originalFilename of [
      "../../etc/passwd",
      "dir/take.mp3",
      "dir\\take.mp3",
      "..",
      "   ",
      "",
    ]) {
      expect(
        await stageUpload(deps, { stageKind: "audio", originalFilename, content: chunks("x") }),
      ).toEqual({ ok: false, reason: "unsafe-filename" });
    }

    expect(stagedFiles(deps.db)).toEqual([]);
    expect(existsSync(join(deps.paths.staging, "id1"))).toBe(false);
  });

  it("refuses a file that carries no bytes and leaves nothing behind", async () => {
    const { deps } = harness();

    const result = await stageUpload(deps, {
      stageKind: "audio",
      originalFilename: "empty.mp3",
      content: chunks(),
    });

    expect(result).toEqual({ ok: false, reason: "empty-file" });
    expect(stagedFiles(deps.db)).toEqual([]);
    expect(existsSync(join(deps.paths.staging, "id1"))).toBe(false);
  });

  it("cleans up a half-written file when the upload breaks, and says so", async () => {
    const { deps, events, lines } = harness();

    await expect(
      stageUpload(deps, {
        stageKind: "audio",
        originalFilename: "take.mp3",
        content: failing(),
      }),
    ).rejects.toThrow(/socket hung up/);

    expect(stagedFiles(deps.db)).toEqual([]);
    expect(existsSync(join(deps.paths.staging, "id1"))).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "staging.failed", stagedFileId: "id1" });
    expect(lines.some((line) => line.includes("staging.failed"))).toBe(true);
  });

  it("finishes the copy even when nothing is listening to progress", async () => {
    const { deps, lines } = harness();
    const exploding: StorageDeps = {
      ...deps,
      emit: (): void => {
        throw new Error("no subscriber");
      },
    };

    const result = await stageUpload(exploding, {
      stageKind: "audio",
      originalFilename: "take.mp3",
      content: chunks("hello ", "world"),
    });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(deps.paths.staging, "id1"), "utf8")).toBe("hello world");
    expect(lines.some((line) => line.includes("staging.emit"))).toBe(true);
  });
});

describe("attachStagedFile", () => {
  async function staged(deps: StorageDeps, originalFilename: string): Promise<string> {
    const result = await stageUpload(deps, {
      stageKind: "images",
      originalFilename,
      content: chunks("png bytes"),
    });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    return result.file.id;
  }

  it("moves the file into the project folder and records it as an output", async () => {
    const { deps } = harness();
    const id = await staged(deps, "Shot One.PNG");

    const result = attachStagedFile(deps, {
      stagedFileId: id,
      projectId: "p1",
      role: "image",
      index: 2,
    });

    expect(result).toEqual({
      ok: true,
      output: {
        id: "id2",
        projectId: "p1",
        stageKind: "images",
        role: "image",
        path: "images/002.png",
        originalFilename: "Shot One.PNG",
        bytes: 9,
        durationMs: null,
        meta: { index: 2 },
        createdAt: "2026-09-02T10:00:04.000Z",
      },
    });
    expect(readFileSync(join(deps.paths.projects, "p1", "images", "002.png"), "utf8")).toBe(
      "png bytes",
    );
    expect(existsSync(join(deps.paths.staging, id))).toBe(false);
    expect(stagedFiles(deps.db)).toEqual([]);
    expect(outputsOf(deps.db, "p1")).toHaveLength(1);
  });

  it("refuses a staged file it has never seen", () => {
    const { deps } = harness();

    expect(
      attachStagedFile(deps, { stagedFileId: "nope", projectId: "p1", role: "thumbnail" }),
    ).toEqual({ ok: false, reason: "unknown-staged-file" });
  });

  it("refuses a copy that has not finished, and leaves it staged", () => {
    const { deps } = harness();
    deps.db.exec(
      "INSERT INTO staged_files VALUES ('half','audio','half','take.mp3',3,'copying','2026-09-01')",
    );

    expect(
      attachStagedFile(deps, { stagedFileId: "half", projectId: "p1", role: "audio_body" }),
    ).toEqual({ ok: false, reason: "still-copying" });
    expect(stagedFileById(deps.db, "half")?.state).toBe("copying");
  });
});

describe("discardStagedFile", () => {
  it("removes the file and forgets the row", async () => {
    const { deps } = harness();
    await stageUpload(deps, {
      stageKind: "thumbnail",
      originalFilename: "thumb.jpg",
      content: chunks("jpg"),
    });

    expect(discardStagedFile(deps, "id1")).toEqual({ ok: true });

    expect(existsSync(join(deps.paths.staging, "id1"))).toBe(false);
    expect(stagedFiles(deps.db)).toEqual([]);
  });

  it("refuses an id it never staged", () => {
    expect(discardStagedFile(harness().deps, "nope")).toEqual({
      ok: false,
      reason: "unknown-staged-file",
    });
  });
});

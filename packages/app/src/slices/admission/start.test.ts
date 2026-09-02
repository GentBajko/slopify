import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { StorageDeps } from "../storage/staging.js";
import { stageUpload } from "../storage/staging.js";
import type { RunDraft } from "./model.js";
import { stagesOf } from "./repo.js";
import { initialState, startRun } from "./start.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };
const log: Log = { write: (): void => {} };

function deps(): StorageDeps {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-start-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${n}`;
    },
  };
  return { db, paths, ids, clock, log, emit: (): void => {} };
}

function upload(storage: StorageDeps, kind: "audio" | "images", body: string): Promise<string> {
  return stageUpload(storage, {
    stageKind: kind,
    originalFilename: `${kind}.bin`,
    content: (async function* () {
      yield Buffer.from(body);
    })(),
  }).then((result) => {
    if (!result.ok) {
      throw new Error(result.reason);
    }
    return result.file.id;
  });
}

function draft(over: Partial<RunDraft> = {}): RunDraft {
  return {
    title: "Rope Tricks",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "provide",
      images: "provide",
      thumbnail: "off",
      video: "generate",
    },
    imagePrompts: [],
    values: {},
    provided: { article: "The article." },
    silenceGapSeconds: 3,
    ...over,
  };
}

describe("initialState", () => {
  it("marks Provide provided, Off skipped, and everything else pending", () => {
    expect(initialState("provide")).toBe("provided");
    expect(initialState("off")).toBe("skipped");
    expect(initialState("generate")).toBe("pending");
    expect(initialState("from_prompt")).toBe("pending");
    expect(initialState("prompt_by_llm")).toBe("pending");
  });
});

describe("startRun", () => {
  it("writes the project, its six stages, and the provided outputs together", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration bytes");
    const first = await upload(storage, "images", "one");
    const second = await upload(storage, "images", "two");

    const { project } = startRun(
      storage,
      draft({ provided: { article: "The article.", audio, images: [first, second] } }),
      { article: "rendered body" },
    );

    expect(project.title).toBe("Rope Tricks");
    expect(project.config.rendered).toEqual({ article: "rendered body" });
    expect(stagesOf(storage.db, project.id).map((stage) => `${stage.kind}:${stage.state}`)).toEqual(
      [
        "research:skipped",
        "article:provided",
        "audio:provided",
        "images:provided",
        "thumbnail:skipped",
        "video:pending",
      ],
    );

    const outputs = storage.db
      .prepare("SELECT role, path FROM outputs WHERE project_id = ? ORDER BY rowid")
      .all(project.id);
    expect(outputs).toEqual([
      { role: "article_txt", path: "article.txt" },
      { role: "audio_body", path: "audio-body.bin" },
      { role: "image", path: "images/001.bin" },
      { role: "image", path: "images/002.bin" },
    ]);
    const dir = join(storage.paths.projects, project.id);
    expect(readFileSync(join(dir, "article.txt"), "utf8")).toBe("The article.");
    expect(readFileSync(join(dir, "images", "002.bin"), "utf8")).toBe("two");
    expect(storage.db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({ n: 0 });
  });

  it("keeps the slideshow order the user left the list in", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");
    const a = await upload(storage, "images", "alpha");
    const b = await upload(storage, "images", "beta");

    const { project } = startRun(
      storage,
      draft({ provided: { article: "x", audio, images: [b, a] } }),
      {},
    );

    const dir = join(storage.paths.projects, project.id, "images");
    expect(readFileSync(join(dir, "001.bin"), "utf8")).toBe("beta");
    expect(readFileSync(join(dir, "002.bin"), "utf8")).toBe("alpha");
  });

  it("stores pasted research notes when research is provided", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");
    const image = await upload(storage, "images", "one");

    const { project } = startRun(
      storage,
      draft({
        sources: { ...draft().sources, research: "provide", article: "generate" },
        provided: { research: "  the notes  ", audio, images: [image] },
      }),
      {},
    );

    expect(readFileSync(join(storage.paths.projects, project.id, "research.txt"), "utf8")).toBe(
      "the notes",
    );
  });

  it("writes nothing at all when one provided file has gone missing", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");

    expect(() =>
      startRun(storage, draft({ provided: { article: "x", audio, images: ["gone"] } }), {}),
    ).toThrow(/could not be attached/);

    expect(storage.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 0 });
    expect(storage.db.prepare("SELECT count(*) AS n FROM stages").get()).toEqual({ n: 0 });
    expect(storage.db.prepare("SELECT count(*) AS n FROM outputs").get()).toEqual({ n: 0 });
    // The audio file moved before the rollback; the boot reconcile collects it, because
    // no project row claims the folder it now sits in.
    expect(existsSync(join(storage.paths.staging, audio))).toBe(false);
  });
});

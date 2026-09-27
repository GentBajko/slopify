import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { saveNarrationAliases } from "../narration/aliases-library.js";
import type { StorageDeps } from "../storage/staging.js";
import { stageUpload } from "../storage/staging.js";
import type { RunDraft } from "./model.js";
import { stagesOf } from "./repo.js";
import { initialState, startRun } from "./start.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
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
    imageSeconds: 15,
    zoomPercent: 22.5,
    motionStyle: "zoom",
    edgeSilenceSeconds: 0,
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
  it("fills the title's keywords, so a template's pattern names each project", () => {
    const run = startRun(
      deps(),
      draft({
        title: "D&D Lore: {{Topic}}",
        values: { Topic: "Vecna" },
        sources: {
          ...draft().sources,
          audio: "off",
          images: "off",
          video: "off",
        },
      }),
      {},
    );
    expect(run.project.title).toBe("D&D Lore: Vecna");
    expect(run.project.config.title).toBe("D&D Lore: Vecna");
  });
  it("names Plain on a new project's document when the draft names no theme", () => {
    const storage = deps();
    const sources = {
      ...draft().sources,
      audio: "off" as const,
      images: "off" as const,
      video: "off" as const,
      document: "generate" as const,
    };
    expect(startRun(storage, draft({ sources }), {}).project.config.document).toEqual({
      theme: "plain",
    });
    const chosen = draft({ sources, document: { theme: "dicemaster" } });
    expect(startRun(storage, chosen, {}).project.config.document).toEqual({ theme: "dicemaster" });
    const off = draft({ sources: { ...sources, document: "off" } });
    expect(startRun(storage, off, {}).project.config.document).toBeUndefined();
    storage.db.close();
  });

  it("queues a WAV export when Video is Off and Audio is supplied", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "supplied audio");
    const { stages } = startRun(
      storage,
      draft({
        sources: { ...draft().sources, images: "off", video: "off" },
        provided: { article: "Article", audio },
      }),
      {},
    );
    expect(stages.find((stage) => stage.kind === "video")).toMatchObject({
      source: "off",
      state: "pending",
    });
    expect(stages.find((stage) => stage.kind === "images")).toMatchObject({
      source: "off",
      state: "skipped",
    });
    storage.db.close();
  });

  it("skips final media output for an Article-only run", () => {
    const storage = deps();
    const { stages } = startRun(
      storage,
      draft({ sources: { ...draft().sources, audio: "off", images: "off", video: "off" } }),
      {},
    );
    expect(stages.every((stage) => stage.state === "provided" || stage.state === "skipped")).toBe(
      true,
    );
    storage.db.close();
  });

  it("writes the project, its stages, and the provided outputs together", async () => {
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
        // A draft saved before the Document stage has no document source: Off.
        "document:skipped",
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
    // What is stored is the narration source, so the paste has been through
    // the same markdown reduction the article stage puts its own output through.
    expect(readFileSync(join(dir, "article.txt"), "utf8")).toBe("The article.\n");
    expect(readFileSync(join(dir, "images", "002.bin"), "utf8")).toBe("two");
    expect(storage.db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({ n: 0 });
  });

  it("queues the document when the run asks for one, with its theme in the config", () => {
    const storage = deps();

    const { project } = startRun(
      storage,
      draft({
        sources: {
          ...draft().sources,
          audio: "off",
          images: "off",
          video: "off",
          document: "generate",
        },
        document: { theme: "plain" },
      }),
      {},
    );

    expect(
      stagesOf(storage.db, project.id)
        .filter((stage) => stage.kind === "document")
        .map((stage) => `${stage.source}:${stage.state}`),
    ).toEqual(["generate:pending"]);
    expect(project.config.document).toEqual({ theme: "plain" });
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

  it("leaves every staged upload in place when a later attach fails", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");
    const first = await upload(storage, "images", "one");
    const second = await upload(storage, "images", "two");

    // The fourth attach fails, after three files have already been placed.
    expect(() =>
      startRun(
        storage,
        draft({ provided: { article: "x", audio, images: [first, second, "gone"] } }),
        {},
      ),
    ).toThrow(/could not be attached/);

    // Every staged row came back with the rollback, and every staged file is still on
    // disk beside it, so pressing Play again works instead of failing forever.
    expect(
      storage.db
        .prepare("SELECT id FROM staged_files ORDER BY created_at, id")
        .all()
        .map((row) => row.id),
    ).toEqual([audio, first, second]);
    for (const id of [audio, first, second]) {
      expect(existsSync(join(storage.paths.staging, id))).toBe(true);
    }

    const retried = startRun(
      storage,
      draft({ provided: { article: "x", audio, images: [first, second] } }),
      {},
    );
    expect(
      readFileSync(join(storage.paths.projects, retried.project.id, "images", "001.bin"), "utf8"),
    ).toBe("one");
  });

  it("removes a staged upload's source only once the run is committed", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");
    const image = await upload(storage, "images", "one");

    const { project } = startRun(
      storage,
      draft({ provided: { article: "x", audio, images: [image] } }),
      {},
    );

    for (const id of [audio, image]) {
      expect(existsSync(join(storage.paths.staging, id))).toBe(false);
    }
    expect(storage.db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({ n: 0 });
    expect(readFileSync(join(storage.paths.projects, project.id, "audio-body.bin"), "utf8")).toBe(
      "narration",
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
    // The copy under the rolled-back project id is an orphan the boot reconcile collects;
    // the staging original is untouched, so the same form can be submitted again.
    expect(existsSync(join(storage.paths.staging, audio))).toBe(true);
  });
});

describe("startRun with the shorts' background music", () => {
  const shorts = { enabled: true, count: 2, minSeconds: 45, maxSeconds: 90 } as const;
  const headContent = (storage: StorageDeps, projectId: string): Record<string, unknown> => {
    const row = storage.db
      .prepare(
        "SELECT r.content AS content FROM project_revisions r JOIN project_heads h ON h.revision_id=r.id WHERE h.project_id=?",
      )
      .get(projectId);
    return JSON.parse(String(row?.content)) as Record<string, unknown>;
  };
  const musicAssets = (storage: StorageDeps, projectId: string) =>
    storage.db
      .prepare("SELECT id, path FROM project_assets WHERE project_id=? AND path LIKE 'assets/%'")
      .all(projectId) as { id: string; path: string }[];

  it("copies the music into the project as the first revision's shortsMusic, never as an output", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");
    const image = await upload(storage, "images", "one");
    const music = await upload(storage, "audio", "music bytes");

    const { project } = startRun(
      storage,
      draft({ shorts, provided: { article: "x", audio, images: [image], shortsMusic: music } }),
      {},
    );

    const assets = musicAssets(storage, project.id);
    expect(assets).toHaveLength(1);
    const asset = assets[0];
    expect(headContent(storage, project.id).shortsMusic).toBe(asset?.id);
    expect(readFileSync(join(storage.paths.projects, project.id, asset?.path ?? ""), "utf8")).toBe(
      "music bytes",
    );
    // The stages' own outputs are as before: the music is no stage's file.
    expect(
      storage.db
        .prepare("SELECT role FROM outputs WHERE project_id=? ORDER BY rowid")
        .all(project.id)
        .map((row) => row.role),
    ).toEqual(["article_txt", "audio_body", "image"]);
    expect(existsSync(join(storage.paths.staging, music))).toBe(false);
  });

  it("leaves the music out while Shorts is off", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");
    const image = await upload(storage, "images", "one");
    const music = await upload(storage, "audio", "music bytes");

    const { project } = startRun(
      storage,
      draft({ provided: { article: "x", audio, images: [image], shortsMusic: music } }),
      {},
    );

    expect(musicAssets(storage, project.id)).toEqual([]);
    // Nothing used it, so the staged original is left where it was.
    expect(existsSync(join(storage.paths.staging, music))).toBe(true);
  });

  it("writes nothing when the music has gone missing", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");
    const image = await upload(storage, "images", "one");

    expect(() =>
      startRun(
        storage,
        draft({ shorts, provided: { article: "x", audio, images: [image], shortsMusic: "gone" } }),
        {},
      ),
    ).toThrow(/background music could not be attached/);
    expect(storage.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 0 });
    expect(storage.db.prepare("SELECT count(*) AS n FROM project_assets").get()).toEqual({ n: 0 });
  });
});

describe("narration aliases", () => {
  it("copies Library → Aliases into a generated-audio project that uses them", async () => {
    const storage = deps();
    const saved = saveNarrationAliases(storage, [
      { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
    ]);
    expect(saved.ok).toBe(true);
    const image = await upload(storage, "images", "one");
    const generated = (useNarrationAliases: boolean | undefined) =>
      draft({
        sources: { ...draft().sources, audio: "generate" },
        audio: {
          provider: "voice",
          model: "tts",
          voice: "v1",
          ...(useNarrationAliases === undefined ? {} : { useNarrationAliases }),
        },
        provided: { article: "Dr. Grey.", images: [image] },
      });
    expect(startRun(storage, generated(true), {}, true).project.config.narrationAliases).toEqual([
      { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
    ]);
    // Off, or a draft from before aliases: no copy, so nothing about its narration changes.
    for (const use of [false, undefined])
      expect("narrationAliases" in startRun(storage, generated(use), {}, true).project.config).toBe(
        false,
      );
    // A later Library edit leaves a started project's copy alone.
    saveNarrationAliases(storage, []);
    const first = storage.db.prepare("SELECT config FROM projects ORDER BY rowid LIMIT 1").get();
    expect(JSON.parse(String(first?.config)).narrationAliases).toHaveLength(1);
  });
});

describe("startRun with the ambient bed's own file", () => {
  const bed = { levelDb: -18, fadeInSeconds: 3, tailSeconds: 6 } as const;
  const headContent = (storage: StorageDeps, projectId: string): Record<string, unknown> => {
    const row = storage.db
      .prepare(
        "SELECT r.content AS content FROM project_revisions r JOIN project_heads h ON h.revision_id=r.id WHERE h.project_id=?",
      )
      .get(projectId);
    return JSON.parse(String(row?.content)) as Record<string, unknown>;
  };

  it("copies the file into the project as the first revision's ambientBed", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");
    const image = await upload(storage, "images", "one");
    const file = await upload(storage, "audio", "rain bytes");
    const { project } = startRun(
      storage,
      draft({
        ambientBed: { source: "upload", ...bed },
        provided: { article: "x", audio, images: [image], ambientBed: file },
      }),
      {},
    );
    const asset = headContent(storage, project.id).ambientBed;
    const row = storage.db
      .prepare("SELECT path FROM project_assets WHERE project_id=? AND id=?")
      .get(project.id, String(asset));
    expect(readFileSync(join(storage.paths.projects, project.id, String(row?.path)), "utf8")).toBe(
      "rain bytes",
    );
    expect(existsSync(join(storage.paths.staging, file))).toBe(false);
  });

  it("leaves a staged file alone for a built-in bed", async () => {
    const storage = deps();
    const audio = await upload(storage, "audio", "narration");
    const image = await upload(storage, "images", "one");
    const file = await upload(storage, "audio", "rain bytes");
    const { project } = startRun(
      storage,
      draft({
        ambientBed: { source: "rain", ...bed },
        provided: { article: "x", audio, images: [image], ambientBed: file },
      }),
      {},
    );
    expect(project.config.ambientBed).toEqual({ source: "rain", ...bed });
    expect(existsSync(join(storage.paths.staging, file))).toBe(true);
  });
});

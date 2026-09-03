import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { manualClock } from "../src/kernel/clock.fake.js";
import type { Clock } from "../src/kernel/clock.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import type { Ids } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import type { Paths } from "../src/kernel/paths.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import type { ImagePort } from "../src/kernel/ports/image.js";
import type { LlmPort } from "../src/kernel/ports/llm.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { attemptsOf, sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import type { StageContext } from "../src/kernel/runner/index.js";
import { piecesOf } from "../src/kernel/runner/piece-repo.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import type { StageSource } from "../src/slices/admission/model.js";
import { runThumbnail } from "../src/slices/thumbnail/run.js";

// The thumbnail stage against the real attempt wrapper and the real piece store: §Q82's
// resume - the written prompt is kept and reused - cannot be proved without the rows the
// two doubles' calls leave behind. No provider is called (06-testing Doubles).

const silent: Log = { write: (): void => {} };
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x07]);
const article = "Rope is twisted fibre, and it holds.\n";
const template = "A bold thumbnail about rope for the channel.";

interface Harness {
  readonly db: DatabaseSync;
  readonly dir: string;
  readonly clock: ReturnType<typeof manualClock>;
  readonly deps: {
    readonly db: DatabaseSync;
    readonly paths: Paths;
    readonly ids: Ids;
    readonly clock: Clock;
    readonly log: Log;
  };
  readonly context: StageContext;
}

function harness(source: StageSource, options: { article?: boolean } = {}): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-thumbnail-")));
  ensureDirs(paths, { mode: 0o700 });
  const clock = manualClock();
  const db = openDb(join(paths.dataDir, "test.db"));
  migrate(db, clock);
  const dir = join(paths.projects, "p1");
  mkdirSync(dir, { recursive: true });

  db.prepare("INSERT INTO projects VALUES ('p1','Rope Tricks','16:9',?,?,?)").run(
    JSON.stringify({
      title: "Rope Tricks",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "provide",
        images: "provide",
        thumbnail: source,
        video: "generate",
      },
      llm: { provider: "fake-llm", model: "fake-model" },
      images: { provider: "fake-image", model: "fake-diffusion" },
      imagePrompts: [],
      thumbnailPrompt: "Bold thumbnail",
      values: { topic: "rope" },
      provided: {},
      rendered: { thumbnailPrompt: template },
      silenceGapSeconds: 3,
    }),
    "2026-09-01",
    "2026-09-01",
  );
  db.exec(
    `INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','thumbnail','${source}','running')`,
  );
  if (options.article !== false) {
    writeFileSync(join(dir, "article.txt"), article);
    db.prepare(
      "INSERT INTO outputs (id, project_id, stage_kind, role, path, bytes, meta, created_at) VALUES ('o-txt','p1','article','article_txt','article.txt',?,'{}','2026-09-01')",
    ).run(article.length);
  }

  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `t${String(n)}`;
    },
  };
  return {
    db,
    dir,
    clock,
    deps: { db, paths, ids, clock, log: silent },
    context: {
      stage: { id: "s1", projectId: "p1", kind: "thumbnail", state: "running" },
      signal: new AbortController().signal,
      emit: (): void => {},
    },
  };
}

function registry(llm: LlmPort, image: ImagePort): Registry {
  return {
    llm: () => llm,
    tts: () => {
      throw new Error("no tts adapter");
    },
    image: () => image,
    list: () => Promise.resolve([]),
  };
}

function run(h: Harness, llm: LlmPort, image: ImagePort): Promise<void> {
  return h.clock.settle(
    runThumbnail(
      h.deps,
      h.context,
      stageProviders(
        {
          registry: registry(llm, image),
          attempts: sqliteAttempts(h.db, h.deps.ids),
          clock: h.clock,
          log: silent,
        },
        h.context,
      ),
    ),
  );
}

function thumbnails(db: DatabaseSync): { path: string; meta: string }[] {
  return db
    .prepare("SELECT path, meta FROM outputs WHERE role = 'thumbnail' ORDER BY rowid")
    .all() as { path: string; meta: string }[];
}

describe("the thumbnail stage, from the picked prompt", () => {
  // `logic/09` step 4: one call, the run's aspect, stored apart from the slideshow.
  it("sends the rendered template once and stores the image with its metadata", async () => {
    const h = harness("from_prompt");
    const image = fakeImage({ bytes: pngBytes });
    const llm = fakeLlm();

    await run(h, llm, image);

    expect(llm.calls()).toBe(0);
    expect(image.calls()).toBe(1);
    expect(image.seen()[0]).toMatchObject({ prompt: template, aspect: "16:9" });
    expect(thumbnails(h.db)).toEqual([
      {
        path: "thumbnail.png",
        meta: JSON.stringify({
          promptName: "Bold thumbnail",
          prompt: template,
          provider: "fake-image",
          model: "fake-diffusion",
        }),
      },
    ]);
    // §Q72: it is never in the slideshow, so it carries no slideshow index.
    expect(JSON.parse(thumbnails(h.db)[0]?.meta ?? "{}")).not.toHaveProperty("index");
    expect(readFileSync(join(h.dir, "thumbnail.png"))).toEqual(Buffer.from(pngBytes));
  });

  // §Q74 through `logic/10` §Q82: the image call obeys scenario 09's rules.
  it("fails on a refusal with the provider's own words and without a second attempt", async () => {
    const h = harness("from_prompt");
    const refusing = fakeImage({ refuse: "we cannot make that thumbnail" });

    await expect(run(h, fakeLlm(), refusing)).rejects.toThrow("we cannot make that thumbnail");

    expect(refusing.calls()).toBe(1);
    expect(attemptsOf(h.db, "s1").map((row) => row.outcome)).toEqual(["refusal"]);
    expect(thumbnails(h.db)).toEqual([]);
  });
});

describe("the thumbnail stage, with the prompt written by the LLM", () => {
  // `logic/10` steps 1 to 4: one `complete` call, then one `generate` with what it wrote.
  it("asks the LLM for the prompt once, then the image provider once", async () => {
    const h = harness("prompt_by_llm");
    const llm = fakeLlm({ deltas: ["A weathered dock", " at golden hour."] });
    const image = fakeImage({ bytes: pngBytes });

    await run(h, llm, image);

    expect(llm.calls()).toBe(1);
    expect(image.calls()).toBe(1);
    // Step 1: the instruction, the title, the keyword values, the aspect, the article.
    const sent = llm.seen()[0]?.[0]?.content ?? "";
    expect(sent).toContain(template);
    expect(sent).toContain("Video title: Rope Tricks");
    expect(sent).toContain("topic: rope");
    expect(sent).toContain("Aspect ratio of the thumbnail: 16:9");
    expect(sent).toContain(article.trim());
    // §Q83: the prompt sent is exactly the LLM's output, never edited by the app.
    expect(image.seen()[0]?.prompt).toBe("A weathered dock at golden hour.");
  });

  // Step 3: the written prompt and the messages that asked for it are on the project.
  it("stores the written prompt and what was sent to get it", async () => {
    const h = harness("prompt_by_llm");

    await run(h, fakeLlm({ deltas: ["A weathered dock."] }), fakeImage({ bytes: pngBytes }));

    const written = piecesOf(h.db, "s1", "prompt_written");
    expect(written).toHaveLength(1);
    expect(written[0]?.state).toBe("done");
    expect(JSON.parse(written[0]?.payload ?? "{}")).toMatchObject({ prompt: "A weathered dock." });
    expect(readFileSync(join(h.dir, "instructions-thumbnail.txt"), "utf8")).toContain(
      "=== Thumbnail prompt ===",
    );
    expect(JSON.parse(thumbnails(h.db)[0]?.meta ?? "{}")).toMatchObject({
      prompt: "A weathered dock.",
    });
  });

  // §Q82 and §Q83: "manual retry reuses the stored written prompt and redoes only the
  // image call". The wording the user is looking at must not change under them.
  it("reuses the stored prompt on a retry rather than writing a new one", async () => {
    const h = harness("prompt_by_llm");
    const first = fakeLlm({ deltas: ["A weathered dock."] });
    const refusing = fakeImage({ refuse: "we cannot make that thumbnail" });

    await expect(run(h, first, refusing)).rejects.toThrow("we cannot make that thumbnail");

    expect(first.calls()).toBe(1);
    expect(piecesOf(h.db, "s1", "prompt_written")).toHaveLength(1);

    // A second LLM that would answer with something else, to prove it is never asked.
    const second = fakeLlm({ deltas: ["A completely different thumbnail."] });
    const image = fakeImage({ bytes: pngBytes });
    await run(h, second, image);

    expect(second.calls()).toBe(0);
    expect(image.seen()[0]?.prompt).toBe("A weathered dock.");
    expect(piecesOf(h.db, "s1", "prompt_written")).toHaveLength(1);
    // One instructions file, not two: the second run never sent anything to store.
    expect(
      h.db.prepare("SELECT count(*) AS n FROM outputs WHERE role = 'instructions'").get(),
    ).toEqual({ n: 1 });
  });

  // §Q82: "empty output is a failed attempt", so the wrapper retries it.
  it("counts an empty answer as a failed attempt and asks again", async () => {
    const h = harness("prompt_by_llm");
    const llm = fakeLlm({ reply: (_req, attempt) => (attempt === 1 ? [""] : ["A dock."]) });

    await run(h, llm, fakeImage({ bytes: pngBytes }));

    expect(llm.calls()).toBe(2);
    expect(attemptsOf(h.db, "s1").map((row) => row.outcome)).toEqual(["other", "ok", "ok"]);
    expect(JSON.parse(piecesOf(h.db, "s1", "prompt_written")[0]?.payload ?? "{}")).toMatchObject({
      prompt: "A dock.",
    });
  });

  // §Q82's `image-done` sub-step: a thumbnail already stored is not made twice.
  it("keeps a thumbnail a previous run already stored", async () => {
    const h = harness("prompt_by_llm");
    await run(h, fakeLlm({ deltas: ["A dock."] }), fakeImage({ bytes: pngBytes }));

    const image = fakeImage({ bytes: pngBytes });
    await run(h, fakeLlm({ deltas: ["A dock."] }), image);

    expect(image.calls()).toBe(0);
    expect(thumbnails(h.db)).toHaveLength(1);
  });

  // §Q79's invariant: the stage never starts without an article on the project.
  it("says so when the project has no article to write the prompt from", async () => {
    const h = harness("prompt_by_llm", { article: false });

    await expect(run(h, fakeLlm(), fakeImage({ bytes: pngBytes }))).rejects.toThrow(
      "the project has no article",
    );
    expect(existsSync(join(h.dir, "thumbnail.png"))).toBe(false);
  });
});

describe("the thumbnail stage with a source that never runs", () => {
  // `logic/01` step 1 marks Off `skipped` and Provide `provided`, so the runner never
  // starts this stage for either; reaching it would be a bug in the graph.
  it("refuses to run for Off or Provide", async () => {
    for (const source of ["off", "provide"] as const) {
      const h = harness(source);
      await expect(run(h, fakeLlm(), fakeImage({ bytes: pngBytes }))).rejects.toThrow(
        `the thumbnail stage cannot run with its source set to ${source}`,
      );
    }
  });
});

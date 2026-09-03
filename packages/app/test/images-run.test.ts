import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { manualClock } from "../src/kernel/clock.fake.js";
import type { Clock } from "../src/kernel/clock.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import type { ProjectEvent } from "../src/kernel/events.js";
import type { Ids } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import type { Paths } from "../src/kernel/paths.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import type { ImagePort } from "../src/kernel/ports/image.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { attemptsOf, sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import type { StageContext } from "../src/kernel/runner/index.js";
import { piecesOf } from "../src/kernel/runner/piece-repo.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import { runImages } from "../src/slices/images/run.js";
import type { RecordEvent } from "../src/slices/telemetry/model.js";
import type { Counted } from "../src/slices/telemetry/record.fake.js";
import { recordingCounter } from "../src/slices/telemetry/record.fake.js";

// The images stage against the real attempt wrapper and the real piece store, which is
// what a unit test of the slice cannot show: a slice may not reach a registry or an
// adapter, and the resume cannot be proved without the rows the wrapper writes. No provider
// is called; `adapters/fake/image.ts` is the scripted double.

const silent: Log = { write: (): void => {} };

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x02]);

interface Harness {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly dir: string;
  readonly clock: ReturnType<typeof manualClock>;
  readonly events: ProjectEvent[];
  readonly deps: {
    readonly db: DatabaseSync;
    readonly paths: Paths;
    readonly ids: Ids;
    readonly clock: Clock;
    readonly log: Log;
    readonly count: RecordEvent;
  };
  readonly counted: Counted;
  readonly context: StageContext;
}

interface HarnessOptions {
  // One entry per ticked prompt: its name, its Number, and the rendered body.
  readonly prompts?: readonly { name: string; number: number; body: string }[];
  readonly format?: "16:9" | "9:16";
}

const defaultPrompts = [{ name: "Wide shot", number: 1, body: "a coil of rope on a dock" }];

function harness(options: HarnessOptions = {}): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-images-")));
  ensureDirs(paths, { mode: 0o700 });
  const clock = manualClock();
  const db = openDb(join(paths.dataDir, "test.db"));
  migrate(db, clock);
  const dir = join(paths.projects, "p1");
  mkdirSync(dir, { recursive: true });

  const prompts = options.prompts ?? defaultPrompts;
  const rendered: Record<string, string> = {};
  for (const [at, prompt] of prompts.entries()) {
    rendered[`imagePrompts.${String(at)}`] = prompt.body;
  }
  const format = options.format ?? "16:9";
  db.prepare("INSERT INTO projects VALUES ('p1','Rope',?,?,?,?)").run(
    format,
    JSON.stringify({
      title: "Rope",
      format,
      sources: {
        research: "off",
        article: "provide",
        audio: "provide",
        images: "generate",
        thumbnail: "off",
        video: "generate",
      },
      images: { provider: "fake-image", model: "fake-diffusion" },
      imagePrompts: prompts.map((prompt) => ({ name: prompt.name, number: prompt.number })),
      values: {},
      provided: {},
      rendered,
      silenceGapSeconds: 3,
    }),
    "2026-09-01",
    "2026-09-01",
  );
  db.exec(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','images','generate','running')",
  );

  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  const events: ProjectEvent[] = [];
  const counted = recordingCounter();
  return {
    db,
    paths,
    dir,
    clock,
    events,
    counted,
    deps: { db, paths, ids, clock, log: silent, count: counted.count },
    context: {
      stage: { id: "s1", projectId: "p1", kind: "images", state: "running" },
      signal: new AbortController().signal,
      emit: (event: ProjectEvent): void => {
        events.push(event);
      },
    },
  };
}

function registry(image: ImagePort): Registry {
  return {
    llm: () => {
      throw new Error("no llm adapter");
    },
    tts: () => {
      throw new Error("no tts adapter");
    },
    image: () => image,
    list: () => Promise.resolve([]),
  };
}

function run(h: Harness, image: ImagePort): Promise<void> {
  return h.clock.settle(
    runImages(
      h.deps,
      h.context,
      stageProviders(
        {
          registry: registry(image),
          attempts: sqliteAttempts(h.db, h.deps.ids),
          clock: h.clock,
          log: silent,
        },
        h.context,
      ),
    ),
  );
}

function imageRows(db: DatabaseSync): { role: string; path: string; meta: string }[] {
  return db
    .prepare("SELECT role, path, meta FROM outputs WHERE role = 'image' ORDER BY rowid")
    .all() as { role: string; path: string; meta: string }[];
}

// What the render reads: the image rows in slideshow order, which is `meta.index` and never
// the order the provider happened to answer in.
function slideshow(db: DatabaseSync): string[] {
  return imageRows(db)
    .map((row) => ({ path: row.path, index: Number(JSON.parse(row.meta).index) }))
    .toSorted((left, right) => left.index - right.index)
    .map((one) => one.path);
}

function metaOf(db: DatabaseSync): unknown[] {
  return imageRows(db).map((row) => JSON.parse(row.meta));
}

describe("the images stage through the attempt wrapper", () => {
  // Number is how many times each ticked prompt is sent.
  it("sends a prompt with Number 3 exactly three times, as three pieces", async () => {
    const h = harness({ prompts: [{ name: "Wide shot", number: 3, body: "a coil of rope" }] });
    const image = fakeImage({ bytes: pngBytes });

    await run(h, image);

    expect(image.calls()).toBe(3);
    expect(image.seen().map((req) => req.prompt)).toEqual([
      "a coil of rope",
      "a coil of rope",
      "a coil of rope",
    ]);
    expect(piecesOf(h.db, "s1", "image").map((piece) => piece.state)).toEqual([
      "done",
      "done",
      "done",
    ]);
    expect(imageRows(h.db).map((row) => row.path)).toEqual([
      "images/001.png",
      "images/002.png",
      "images/003.png",
    ]);
    // One event for the stage, carrying the images it stored under the provider and model
    // that drew them. No tokens: an image call reports none.
    expect(h.counted.events().map((one) => one.counters)).toEqual([
      { stage: "images", provider: "fake-image", model: "fake-diffusion", images: 3 },
    ]);
  });

  // Prompts in selection order, then the index within each prompt.
  it("numbers the slideshow by selection order and then by index within the prompt", async () => {
    const h = harness({
      prompts: [
        { name: "Wide", number: 2, body: "the wide shot" },
        { name: "Close", number: 1, body: "the close shot" },
      ],
    });

    await run(h, fakeImage({ bytes: pngBytes }));

    expect(metaOf(h.db)).toEqual([
      {
        index: 1,
        promptName: "Wide",
        prompt: "the wide shot",
        provider: "fake-image",
        model: "fake-diffusion",
      },
      {
        index: 2,
        promptName: "Wide",
        prompt: "the wide shot",
        provider: "fake-image",
        model: "fake-diffusion",
      },
      {
        index: 3,
        promptName: "Close",
        prompt: "the close shot",
        provider: "fake-image",
        model: "fake-diffusion",
      },
    ]);
    expect(piecesOf(h.db, "s1", "image").map((piece) => JSON.parse(piece.payload ?? "{}"))).toEqual(
      [
        expect.objectContaining({ promptIndex: 1, indexInPrompt: 1 }),
        expect.objectContaining({ promptIndex: 1, indexInPrompt: 2 }),
        expect.objectContaining({ promptIndex: 2, indexInPrompt: 1 }),
      ],
    );
  });

  // The run's own frame reaches the adapter, which spells it for its provider.
  it("asks for the run's aspect", async () => {
    const h = harness({ format: "9:16" });
    const image = fakeImage({ bytes: pngBytes });

    await run(h, image);

    expect(image.seen().map((req) => req.aspect)).toEqual(["9:16"]);
  });

  // Stored as received, png or jpg.
  it("keeps the extension the bytes say the image is", async () => {
    const h = harness();

    await run(h, fakeImage({ bytes: jpegBytes, mime: "image/jpeg" }));

    expect(imageRows(h.db).map((row) => row.path)).toEqual(["images/001.jpg"]);
    expect(readFileSync(join(h.dir, "images", "001.jpg"))).toEqual(Buffer.from(jpegBytes));
  });

  // The page fills in as each one arrives.
  it("announces every image as it lands, and the running count beside it", async () => {
    const h = harness({ prompts: [{ name: "Wide", number: 2, body: "a coil of rope" }] });

    await run(h, fakeImage({ bytes: pngBytes }));

    const landed = h.events.filter((event) => event.type === "image.landed");
    expect(landed).toHaveLength(2);
    expect(landed.map((event) => event.index).toSorted()).toEqual([1, 2]);
    expect(h.events.filter((event) => event.type === "stage.progress").at(-1)).toEqual({
      type: "stage.progress",
      projectId: "p1",
      stage: "images",
      current: 2,
      total: 2,
    });
    expect(
      h.db.prepare("SELECT progress_current, progress_total FROM stages WHERE id = 's1'").get(),
    ).toEqual({ progress_current: 2, progress_total: 2 });
  });

  // Manual retry generates only the missing images.
  it("re-sends only the image that failed and keeps the two that landed", async () => {
    const h = harness({ prompts: [{ name: "Wide", number: 3, body: "a coil of rope" }] });
    // The three sends are launched in piece order and the fake counts synchronously, so
    // calls 1, 2 and 3 are the first attempt of each. Sends 1 and 3 land there; send 2 is
    // then alone, and its three retries are calls 4, 5 and 6 - four attempts spent on one
    // image while its siblings keep theirs.
    const fell = { kind: "other", message: "the GPU fell over" } as const;
    const failing = fakeImage({
      bytes: pngBytes,
      failOnAttempt: { 2: fell, 4: fell, 5: fell, 6: fell },
    });

    await expect(run(h, failing)).rejects.toThrow("the GPU fell over");

    expect(failing.calls()).toBe(6);

    expect(piecesOf(h.db, "s1", "image").map((piece) => piece.state)).toEqual([
      "done",
      "failed",
      "done",
    ]);
    expect(imageRows(h.db).map((row) => row.path)).toEqual(["images/001.png", "images/003.png"]);

    const second = fakeImage({ bytes: pngBytes });
    await run(h, second);

    // Only the missing one is asked for, and it is asked for once.
    expect(second.calls()).toBe(1);
    expect(piecesOf(h.db, "s1", "image").map((piece) => piece.state)).toEqual([
      "done",
      "done",
      "done",
    ]);
    // The resumed image was written last, so it is last by rowid - and the slideshow order
    // is read off `meta.index`, which the piece fixed before anything was sent.
    expect(imageRows(h.db).map((row) => row.path)).toEqual([
      "images/001.png",
      "images/003.png",
      "images/002.png",
    ]);
    expect(slideshow(h.db)).toEqual(["images/001.png", "images/002.png", "images/003.png"]);
    // Images made (stored images). The failed run counted nothing, and the resume counted only
    // the one image it actually made - not the two it kept.
    expect(h.counted.events().map((one) => one.counters.images)).toEqual([1]);
  });

  // No retries. The user edits the prompt and re-runs the stage.
  it("fails on a refusal with the provider's own words and without a second attempt", async () => {
    const h = harness();
    const refusing = fakeImage({ refuse: "this prompt is not allowed by our safety system" });

    await expect(run(h, refusing)).rejects.toThrow(
      "this prompt is not allowed by our safety system",
    );

    expect(refusing.calls()).toBe(1);
    const attempts = attemptsOf(h.db, "s1");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe("refusal");
    // The only wait asked of the clock is the attempt's own 300 s deadline watch; no
    // backoff was served, because there was no second attempt to wait for.
    expect(h.clock.waits).toEqual([300_000]);
    expect(imageRows(h.db)).toEqual([]);
  });

  // The other half of the resume: a file the boot reconcile removed is made again rather
  // than left as a row pointing at nothing.
  it("makes an image again when its row survived but its file did not", async () => {
    const h = harness();
    await run(h, fakeImage({ bytes: pngBytes }));
    rmSync(join(h.dir, "images", "001.png"));
    h.db.prepare("DELETE FROM outputs WHERE role = 'image'").run();

    const second = fakeImage({ bytes: pngBytes });
    await run(h, second);

    expect(second.calls()).toBe(1);
    expect(existsSync(join(h.dir, "images", "001.png"))).toBe(true);
  });

  // `slices/library/slots.ts` puts the substituted body on the run under
  // `imagePrompts.<n>`; a ticked prompt with no rendered text is a bug in admission.
  it("says which prompt has no rendered text rather than sending an empty one", async () => {
    const h = harness();
    h.db
      .prepare(
        "UPDATE projects SET config = json_set(config, '$.rendered', json('{}')) WHERE id = 'p1'",
      )
      .run();
    const image = fakeImage({ bytes: pngBytes });

    await expect(run(h, image)).rejects.toThrow(
      "the run has no rendered text for the image prompt Wide shot",
    );
    expect(image.calls()).toBe(0);
  });

  it("does not send anything again when every image is already stored", async () => {
    const h = harness({ prompts: [{ name: "Wide", number: 2, body: "a coil of rope" }] });
    await run(h, fakeImage({ bytes: pngBytes }));

    const second = fakeImage({ bytes: pngBytes });
    await run(h, second);

    expect(second.calls()).toBe(0);
    expect(imageRows(h.db)).toHaveLength(2);
    // The second run made nothing, so it counted nothing; the first counted both.
    expect(h.counted.events().map((one) => one.counters.images)).toEqual([2, 0]);
  });
});

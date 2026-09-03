import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import type { FakeTts } from "../src/adapters/fake/tts.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { manualClock } from "../src/kernel/clock.fake.js";
import type { Clock } from "../src/kernel/clock.js";
import { systemClock } from "../src/kernel/clock.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import type { ProjectEvent } from "../src/kernel/events.js";
import type { Ids } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import type { Paths } from "../src/kernel/paths.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import type { TtsPort } from "../src/kernel/ports/tts.js";
import { attemptsOf, sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import type { StageContext } from "../src/kernel/runner/index.js";
import { piecesOf } from "../src/kernel/runner/piece-repo.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import { nothingToNarrate, runNarration } from "../src/slices/narration/run.js";
import type { RecordEvent } from "../src/slices/telemetry/model.js";
import type { Counted } from "../src/slices/telemetry/record.fake.js";
import { recordingCounter } from "../src/slices/telemetry/record.fake.js";
import { probeDurationMs, resolveFfmpeg } from "../src/slices/video/ffmpeg.js";

// The audio stage against the real attempt wrapper and the real bundled ffmpeg, which is
// what `slices/narration/*.test.ts` cannot show: a slice may not reach a registry or an
// adapter, and a concatenation cannot be proved without decoding one. No provider is
// called; `adapters/fake/tts.ts` answers with mp3 bytes ffmpeg itself made
// (06-testing Doubles).

const silent: Log = { write: (): void => {} };
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);

// Three paragraphs, so `paragraph` mode makes three chunks and the join has two seams.
const paragraphs = [
  "Rope is older than writing.",
  "The oldest fragment found is two-ply, twisted from plant fibre.",
  "Modern rope is laid or braided.",
] as const;
// One tone per paragraph, at lengths that add up to nothing round, so a total that only
// looked right could not be a coincidence.
const seconds: Readonly<Record<string, number>> = {
  [paragraphs[0]]: 1.2,
  [paragraphs[1]]: 0.7,
  [paragraphs[2]]: 0.45,
  "Welcome to the channel.": 0.6,
  "Thanks for watching.": 0.35,
};

function tone(path: string, hz: number, length: number): void {
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${String(hz)}:duration=${String(length)}:sample_rate=44100`,
    "-ac",
    "2",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    path,
  ]);
}

// The bytes the fake hands back for a given text, made once into a scratch folder so the
// same request always answers with the same audio.
function library(): (text: string) => Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "slopify-tones-"));
  const made = new Map<string, Uint8Array>();
  let hz = 300;
  return (text: string): Uint8Array => {
    const held = made.get(text);
    if (held !== undefined) {
      return held;
    }
    const path = join(dir, `${String(made.size)}.mp3`);
    hz += 40;
    tone(path, hz, seconds[text] ?? 0.5);
    const bytes = new Uint8Array(readFileSync(path));
    made.set(text, bytes);
    return bytes;
  };
}

const tones = library();

function measure(path: string): Promise<number> {
  return probeDurationMs(ffmpeg, path, new AbortController().signal, silent);
}

interface Harness {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly dir: string;
  readonly events: readonly ProjectEvent[];
  readonly deps: {
    readonly db: DatabaseSync;
    readonly paths: Paths;
    readonly ids: Ids;
    readonly clock: Clock;
    readonly log: Log;
    readonly ffmpeg: string;
    readonly count: RecordEvent;
  };
  readonly counted: Counted;
  readonly context: StageContext;
}

interface HarnessOptions {
  readonly article?: string;
  readonly chunking?: { readonly mode: string; readonly words?: number };
  readonly segments?: boolean;
  readonly clock?: Clock;
}

function harness(options: HarnessOptions = {}): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-narration-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(join(paths.dataDir, "test.db"));
  const clock = options.clock ?? systemClock;
  migrate(db, clock);
  const dir = join(paths.projects, "p1");
  mkdirSync(dir, { recursive: true });

  db.prepare("INSERT INTO projects VALUES ('p1','Rope','16:9',?,?,?)").run(
    JSON.stringify({
      title: "Rope",
      format: "16:9",
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "provide",
        thumbnail: "off",
        video: "generate",
      },
      audio: { provider: "fake-tts", model: "fake-voice-model", voice: "v-narrator" },
      imagePrompts: [],
      values: {},
      provided: {},
      rendered: {},
      silenceGapSeconds: 3,
      ...(options.chunking === undefined ? {} : { chunking: options.chunking }),
    }),
    "2026-09-01",
    "2026-09-01",
  );
  db.exec(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','audio','generate','running')",
  );

  const article = options.article ?? paragraphs.join("\n\n");
  writeFileSync(join(dir, "article.txt"), article);
  db.prepare(
    "INSERT INTO outputs (id, project_id, stage_kind, role, path, bytes, meta, created_at) VALUES ('o-txt','p1','article','article_txt','article.txt',?,'{}','2026-09-01')",
  ).run(article.length);

  if (options.segments === true) {
    const piece = db.prepare(
      "INSERT INTO stage_pieces (id, stage_id, kind, idx, state, payload) VALUES (?, 's1', 'segment', ?, 'done', ?)",
    );
    piece.run(
      "seg-1",
      1,
      JSON.stringify({
        category: "intro",
        name: "Standard intro",
        mode: "text",
        text: "Welcome to the channel.",
      }),
    );
    piece.run(
      "seg-2",
      2,
      JSON.stringify({
        category: "outro",
        name: "Standard outro",
        mode: "llm",
        text: "Thanks for watching.",
      }),
    );
  }

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
    events,
    counted,
    deps: { db, paths, ids, clock, log: silent, ffmpeg, count: counted.count },
    context: {
      stage: { id: "s1", projectId: "p1", kind: "audio", state: "running" },
      signal: new AbortController().signal,
      emit: (event: ProjectEvent): void => {
        events.push(event);
      },
    },
  };
}

function registry(tts: TtsPort): Registry {
  return {
    llm: () => {
      throw new Error("no llm adapter");
    },
    tts: () => tts,
    image: () => {
      throw new Error("no image adapter");
    },
    list: () => Promise.resolve([]),
  };
}

// A provider that answers every request with a real mp3 of a known length.
function speaking(): FakeTts {
  return fakeTts({ bytesFor: (req) => [tones(req.text)] });
}

function run(h: Harness, tts: TtsPort): Promise<void> {
  return runNarration(
    h.deps,
    h.context,
    stageProviders(
      {
        registry: registry(tts),
        attempts: sqliteAttempts(h.db, h.deps.ids),
        clock: h.deps.clock,
        log: silent,
      },
      h.context,
    ),
  );
}

function outputRows(db: DatabaseSync): unknown[] {
  return db
    .prepare(
      "SELECT role, path, duration_ms, meta FROM outputs WHERE stage_kind = 'audio' ORDER BY rowid",
    )
    .all();
}

describe("the audio stage through the attempt wrapper and the real ffmpeg", () => {
  it("narrates every paragraph, joins them in order, and measures the sum", async () => {
    const h = harness({ chunking: { mode: "paragraph" } });
    const tts = speaking();

    await run(h, tts);

    // §Q65: one request per paragraph, and the text sent is the paragraph's own.
    expect(tts.calls()).toBe(3);
    expect(tts.seen()).toEqual([...paragraphs]);
    expect(piecesOf(h.db, "s1", "chunk").map((piece) => piece.state)).toEqual([
      "done",
      "done",
      "done",
    ]);

    const body = join(h.dir, "audio-body.mp3");
    expect(existsSync(body)).toBe(true);
    const parts = await Promise.all(
      [1, 2, 3].map((at) => measure(join(h.dir, "audio-chunks", `00${String(at)}.mp3`))),
    );
    const total = parts.reduce((sum, part) => sum + part, 0);
    const joined = await measure(body);
    // The concat adds no silence (§Q65), so the joined file is the sum of its parts. The
    // tolerance is two mp3 frames: the encoder works in 1152-sample blocks and cannot end
    // a file mid-block.
    expect(Math.abs(joined - total)).toBeLessThan(60);

    // §Q68: the duration on the row is the measured one, because logic/11 builds the
    // video timeline out of it.
    const stored = h.db
      .prepare("SELECT duration_ms AS ms FROM outputs WHERE role = 'audio_body'")
      .get() as { ms: number };
    expect(stored.ms).toBe(joined);
    expect(stored.ms).toBeGreaterThan(2000);

    // §Q68 again: provider and voice travel with the audio they made.
    expect(outputRows(h.db)).toEqual([
      {
        role: "audio_body",
        path: "audio-body.mp3",
        duration_ms: joined,
        meta: JSON.stringify({ provider: "fake-tts", voice: "v-narrator" }),
      },
    ]);
    h.db.close();
  }, 120_000);

  // §Q65 first case: "Whole text = one request."
  it("sends the whole text as one request and copies it rather than re-encoding", async () => {
    const h = harness({ chunking: { mode: "whole" } });
    const tts = speaking();

    await run(h, tts);

    expect(tts.calls()).toBe(1);
    expect(tts.seen()).toEqual([paragraphs.join("\n\n")]);
    // One chunk, so the body is that chunk byte for byte: nothing was decoded and
    // re-encoded for a join that had nothing to join.
    expect(readFileSync(join(h.dir, "audio-body.mp3"))).toEqual(
      readFileSync(join(h.dir, "audio-chunks", "001.mp3")),
    );
    h.db.close();
  }, 120_000);

  // §Q93: "each picked segment's text is one TTS request ... stored as its own audio file
  // with its duration; body chunking does not apply to them."
  it("narrates the intro and the outro as one request each, with their own durations", async () => {
    const h = harness({ chunking: { mode: "paragraph" }, segments: true });
    const tts = speaking();

    await run(h, tts);

    expect(tts.seen()).toEqual([
      ...paragraphs,
      // The text-mode entry is spoken verbatim and the LLM-mode one as the article stage
      // wrote it; neither was chunked.
      "Welcome to the channel.",
      "Thanks for watching.",
    ]);
    const rows = outputRows(h.db) as Array<{ role: string; duration_ms: number }>;
    expect(rows.map((row) => row.role)).toEqual(["audio_body", "audio_intro", "audio_outro"]);
    for (const row of rows) {
      expect(row.duration_ms).toBeGreaterThan(0);
    }
    const intro = rows.find((row) => row.role === "audio_intro");
    expect(intro?.duration_ms).toBe(await measure(join(h.dir, "audio-intro.mp3")));
    // §Q65's invariant: the body plus the two segments are the project's only audio
    // outputs. The chunks are files, not outputs.
    expect(rows).toHaveLength(3);
    // logic/16 step 2: "audio per segment (body, intro, outro)", and step 3 takes the
    // seconds from the duration that was measured rather than from the text. No model:
    // the TTS port carries none, which is why the output row has none either.
    expect(h.counted.events().map((one) => one.counters)).toEqual(
      rows.map((row) => ({
        stage: "audio",
        segment:
          row.role === "audio_body" ? "body" : row.role === "audio_intro" ? "intro" : "outro",
        provider: "fake-tts",
        audioSeconds: row.duration_ms / 1000,
      })),
    );
    h.db.close();
  }, 120_000);

  it("reports k of N as the chunks land", async () => {
    const h = harness({ chunking: { mode: "paragraph" } });

    await run(h, speaking());

    expect(
      h.events.filter((event) => event.type === "stage.progress").map((event) => event.current),
    ).toEqual([0, 1, 2, 3]);
    expect(h.db.prepare("SELECT progress_current, progress_total FROM stages").get()).toEqual({
      progress_current: 3,
      progress_total: 3,
    });
    h.db.close();
  }, 120_000);

  // §Q66: "One chunk exhausts its retries → the whole stage fails; manual retry keeps
  // completed chunks and re-runs only failed or not-started ones, then concatenates."
  // logic/16 step 2 puts the event on the unit completing, so a stage that never joined
  // its body counted nothing - and §Q112's aborted calls have nothing to add either.
  it("counts no audio for a stage that failed before it joined the body", async () => {
    const beat = manualClock("2026-09-02T10:00:00.000Z");
    const h = harness({ chunking: { mode: "paragraph" }, clock: beat });
    const failing = fakeTts({
      bytesFor: (req) => (req.text === paragraphs[1] ? throwOut() : [tones(req.text)]),
    });

    await expect(beat.settle(run(h, failing))).rejects.toThrow(/synthesiser is down/);

    expect(h.counted.events()).toEqual([]);
    h.db.close();
  }, 120_000);

  it("fails the stage when one chunk exhausts its retries, keeping the chunks that landed", async () => {
    const beat = manualClock("2026-09-02T10:00:00.000Z");
    const h = harness({ chunking: { mode: "paragraph" }, clock: beat });
    // The second paragraph fails on every attempt; the other two answer at once.
    const failing = fakeTts({
      bytesFor: (req) => (req.text === paragraphs[1] ? throwOut() : [tones(req.text)]),
    });

    await expect(beat.settle(run(h, failing))).rejects.toThrow(/synthesiser is down/);

    expect(beat.waits).toContain(2000);
    expect(beat.waits).toContain(8000);
    expect(beat.waits).toContain(30_000);
    const states = piecesOf(h.db, "s1", "chunk").map((piece) => piece.state);
    expect(states).toEqual(["done", "failed", "done"]);
    // The two that landed kept their audio for the retry, and no body was written.
    expect(existsSync(join(h.dir, "audio-chunks", "001.mp3"))).toBe(true);
    expect(existsSync(join(h.dir, "audio-chunks", "003.mp3"))).toBe(true);
    expect(existsSync(join(h.dir, "audio-body.mp3"))).toBe(false);
    expect(outputRows(h.db)).toEqual([]);
    // Four attempts on the failing chunk, one each on the other two.
    const perPiece: Record<string, number> = {};
    for (const row of attemptsOf(h.db, "s1")) {
      const at = row.pieceId ?? "stage";
      perPiece[at] = (perPiece[at] ?? 0) + 1;
    }
    expect(Object.values(perPiece).toSorted()).toEqual([1, 1, 4]);
    h.db.close();
  }, 120_000);

  it("re-runs only the chunk that failed when the stage is retried", async () => {
    const beat = manualClock("2026-09-02T10:00:00.000Z");
    const h = harness({ chunking: { mode: "paragraph" }, clock: beat });
    const failing = fakeTts({
      bytesFor: (req) => (req.text === paragraphs[1] ? throwOut() : [tones(req.text)]),
    });
    await expect(beat.settle(run(h, failing))).rejects.toThrow(/synthesiser is down/);

    // The manual retry of `logic/01` §Q5, against the same project and the same rows.
    const working = speaking();
    await runNarration(
      { ...h.deps, clock: systemClock },
      h.context,
      stageProviders(
        {
          registry: registry(working),
          attempts: sqliteAttempts(h.db, h.deps.ids),
          clock: systemClock,
          log: silent,
        },
        h.context,
      ),
    );

    // Only the middle paragraph was spoken again; the other two were read off disk.
    expect(working.seen()).toEqual([paragraphs[1]]);
    expect(piecesOf(h.db, "s1", "chunk").map((piece) => piece.state)).toEqual([
      "done",
      "done",
      "done",
    ]);
    expect(existsSync(join(h.dir, "audio-body.mp3"))).toBe(true);
    h.db.close();
  }, 120_000);

  // §Q67: "Narration source empty after the split → immediate stage failure 'nothing to
  // narrate', no retries."
  it("fails at once with nothing to narrate when the source is blank", async () => {
    const h = harness({ article: "   \n\n  \n" });
    const tts = speaking();

    await expect(run(h, tts)).rejects.toThrow(nothingToNarrate);

    expect(tts.calls()).toBe(0);
    expect(attemptsOf(h.db, "s1")).toHaveLength(0);
    h.db.close();
  }, 60_000);

  it("fails at once when the article stage left no narration source at all", async () => {
    const h = harness();
    h.db.prepare("DELETE FROM outputs WHERE role = 'article_txt'").run();

    await expect(run(h, speaking())).rejects.toThrow(nothingToNarrate);
    h.db.close();
  }, 60_000);

  // §Q65's third case, end to end: the cut lands on a sentence boundary, so a chunk is
  // always something a voice can read.
  it("cuts at sentence boundaries in the every-N-words mode", async () => {
    const h = harness({
      article: "Rope is older than writing. It is stronger than it looks. Braid it well.",
      chunking: { mode: "words", words: 6 },
    });
    const tts = speaking();

    await run(h, tts);

    expect(tts.seen()).toEqual([
      "Rope is older than writing.",
      "It is stronger than it looks.",
      "Braid it well.",
    ]);
    expect(existsSync(join(h.dir, "audio-body.mp3"))).toBe(true);
    h.db.close();
  }, 120_000);
});

function throwOut(): never {
  throw new Error("the synthesiser is down");
}

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { Message } from "../../kernel/ports/llm.js";
import { providerError } from "../../kernel/ports/model.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { insertPiece, piecesOf } from "../../kernel/runner/piece-repo.js";
import type { LlmAnswer, LlmCall, StageProviders } from "../../kernel/runner/providers.js";
import { outputsOf } from "../storage/repo.js";
import type { Counted } from "../telemetry/record.fake.js";
import { recordingCounter } from "../telemetry/record.fake.js";
import type { ResearchDeps } from "./run.js";
import { runResearch, webResearchUnsupported } from "./run.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const silent: Log = { write: (): void => {} };

const rendered: Readonly<Record<string, string>> = { article: "Write about rope." };

const config = {
  title: "Rope",
  format: "16:9",
  sources: {
    research: "generate",
    article: "generate",
    audio: "generate",
    images: "off",
    thumbnail: "off",
    video: "generate",
  },
  llm: { provider: "openrouter", model: "openai/gpt-5" },
  imagePrompts: [],
  values: { topic: "rope" },
  provided: {},
  silenceGapSeconds: 3,
  rendered,
};

interface Harness {
  readonly deps: ResearchDeps;
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly context: StageContext;
  readonly events: readonly ProjectEvent[];
  readonly counted: Counted;
}

function harness(over: Partial<typeof config> = {}): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-research-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(join(paths.dataDir, "test.db"));
  migrate(db, clock);
  db.prepare("INSERT INTO projects VALUES ('p1','Rope','16:9',?,?,?)").run(
    JSON.stringify({ ...config, ...over }),
    "2026-09-01",
    "2026-09-01",
  );
  db.exec(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','research','generate','running')",
  );
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${n}`;
    },
  };
  const events: ProjectEvent[] = [];
  const counted = recordingCounter();
  return {
    db,
    paths,
    events,
    counted,
    deps: { db, paths, ids, clock, log: silent, count: counted.count },
    context: {
      stage: { id: "s1", projectId: "p1", kind: "research", state: "running" },
      signal: new AbortController().signal,
      emit: (event: ProjectEvent): void => {
        events.push(event);
      },
    },
  };
}

// The double stands in for the wrapped calls a stage is handed, not for a provider: it
// applies `check` exactly as `kernel/runner/providers.ts` does, so a slice that forgets
// to pass one is caught here, and it fails on the first bad answer because the retry
// policy the real wrapper runs is proved in `packages/app/test/research-run.test.ts`.
type Turn = "planner" | "chapter" | "synthesis";

interface Made {
  readonly turn: Turn;
  readonly pieceId: string | null;
  readonly webSearch: boolean;
  readonly prompt: string;
}

type Script = (turn: Turn, prompt: string) => string;

interface Fake {
  readonly providers: StageProviders;
  readonly made: readonly Made[];
  readonly order: readonly string[];
}

function fake(script: Script): Fake {
  const made: Made[] = [];
  const order: string[] = [];

  const build = (pieceId: string | null): StageProviders => ({
    llm: async (call: LlmCall): Promise<LlmAnswer> => {
      const prompt = promptOf(call.messages);
      const turn = turnOf(prompt);
      made.push({ turn, pieceId, webSearch: call.webSearch === true, prompt });
      order.push(`start ${turn}${pieceId === null ? "" : ` ${pieceId}`}`);
      // Two turns of the event loop, so a caller that awaited each chapter before
      // starting the next would interleave its starts and finishes.
      await Promise.resolve();
      await Promise.resolve();
      const answer: LlmAnswer = { text: script(turn, prompt), usage: null, finishReason: "stop" };
      const unusable = call.check?.(answer);
      order.push(`finish ${turn}${pieceId === null ? "" : ` ${pieceId}`}`);
      if (unusable !== undefined) {
        throw new Error(unusable);
      }
      return answer;
    },
    tts: () => Promise.reject(new Error("research must not narrate")),
    image: () => Promise.reject(new Error("research must not generate images")),
    forPiece: (id: string): StageProviders => build(id),
  });

  return { providers: build(null), made, order };
}

function promptOf(messages: readonly Message[]): string {
  return messages.map((message) => message.content).join("\n");
}

function turnOf(prompt: string): Turn {
  if (prompt.startsWith("You are planning")) {
    return "planner";
  }
  return prompt.startsWith("You are researching") ? "chapter" : "synthesis";
}

function chapterOf(prompt: string): string {
  return /Research this chapter and no other: (.+)/.exec(prompt)?.[1] ?? "";
}

const threeChapters: Script = (turn, prompt) => {
  if (turn === "planner") {
    return "History\nMaterials\nKnots";
  }
  if (turn === "chapter") {
    return `Found about ${chapterOf(prompt)}.\n\nSources\nhttps://example.test/${chapterOf(prompt)}`;
  }
  return "The whole story.\n\nSources\nhttps://example.test/all";
};

function progress(events: readonly ProjectEvent[]): readonly string[] {
  return events
    .filter((event) => event.type === "stage.progress")
    .map((event) => `${String(event.current)} of ${String(event.total)}`);
}

describe("runResearch", () => {
  it("plans the chapters, researches each of them and writes the notes", async () => {
    const h = harness();
    const llm = fake(threeChapters);

    await runResearch(h.deps, h.context, llm.providers);

    expect(llm.made.map((one) => one.turn)).toEqual([
      "planner",
      "chapter",
      "chapter",
      "chapter",
      "synthesis",
    ]);
    // §Q52: every sub-agent call is web-grounded and the other two are not.
    expect(llm.made.filter((one) => one.webSearch).map((one) => one.turn)).toEqual([
      "chapter",
      "chapter",
      "chapter",
    ]);
    // Each sub-agent call is recorded against its own chapter row (§Q54).
    expect(
      new Set(llm.made.filter((one) => one.pieceId !== null).map((one) => one.pieceId)).size,
    ).toBe(3);
    expect(
      llm.made.filter((one) => one.turn === "chapter").map((one) => chapterOf(one.prompt)),
    ).toEqual(["History", "Materials", "Knots"]);
    // §Q52: the editor is handed what the researchers found, not asked to search again.
    const synthesis = llm.made.at(-1)?.prompt ?? "";
    expect(synthesis).toContain("Found about History.");
    expect(synthesis).toContain("Found about Knots.");

    const pieces = piecesOf(h.db, "s1", "chapter");
    expect(pieces.map((piece) => piece.state)).toEqual(["done", "done", "done"]);
    expect(pieces.map((piece) => piece.idx)).toEqual([1, 2, 3]);
    h.db.close();
  });

  // Step 4: the final notes and every instruction sent are stored on the project.
  it("stores the notes and the instructions it sent", async () => {
    const h = harness();

    await runResearch(h.deps, h.context, fake(threeChapters).providers);

    const outputs = outputsOf(h.db, "p1");
    expect(outputs.map((output) => output.role).toSorted()).toEqual(["instructions", "notes"]);
    const notes = readFileSync(join(h.paths.projects, "p1", "research.txt"), "utf8");
    expect(notes).toBe("The whole story.\n\nSources\nhttps://example.test/all");
    const sent = readFileSync(join(h.paths.projects, "p1", "instructions-research.txt"), "utf8");
    expect(sent).toContain("=== Planner ===");
    expect(sent).toContain("=== Sub-agent: History ===");
    expect(sent).toContain("=== Sub-agent: Materials ===");
    expect(sent).toContain("=== Sub-agent: Knots ===");
    expect(sent).toContain("=== Synthesis ===");
    h.db.close();
  });

  // §Q53: "one per chapter, all in parallel".
  it("runs every sub-agent call at once rather than one after another", async () => {
    const h = harness();
    const llm = fake((turn, prompt) =>
      turn === "planner" ? "A\nB\nC\nD\nE" : threeChapters(turn, prompt),
    );

    await runResearch(h.deps, h.context, llm.providers);

    const chapters = llm.order.filter((line) => line.includes("chapter"));
    expect(chapters).toHaveLength(10);
    // Every sub-agent call had started before any of them finished, which a serial loop
    // could not produce: it would read start, finish, start, finish.
    expect(chapters.slice(0, 5).every((line) => line.startsWith("start"))).toBe(true);
    expect(chapters.slice(5).every((line) => line.startsWith("finish"))).toBe(true);
    h.db.close();
  });

  // Step 5: "k of N chapters researched".
  it("reports each chapter as it lands, and writes the count on the stage", async () => {
    const h = harness();

    await runResearch(h.deps, h.context, fake(threeChapters).providers);

    expect(progress(h.events)).toEqual(["0 of 3", "1 of 3", "2 of 3", "3 of 3"]);
    expect(
      h.db.prepare("SELECT progress_current, progress_total FROM stages WHERE id = 's1'").get(),
    ).toEqual({ progress_current: 3, progress_total: 3 });
    h.db.close();
  });

  // §Q54: "completed sub-agents kept, failed and not-started ones run, then synthesis".
  it("does not research again a chapter an earlier run finished", async () => {
    const h = harness();
    const titles = ["One", "Two", "Three", "Four", "Five"];
    for (const [index, title] of titles.entries()) {
      const done = index < 3;
      insertPiece(h.db, {
        id: `c${String(index + 1)}`,
        stageId: "s1",
        kind: "chapter",
        idx: index + 1,
        state: done ? "done" : "failed",
        payload: JSON.stringify(done ? { title, notes: `kept ${title}` } : { title }),
      });
    }
    const llm = fake(threeChapters);

    await runResearch(h.deps, h.context, llm.providers);

    // No planner call: the chapter list survived the failure (§Q54).
    expect(llm.made.map((one) => one.turn)).toEqual(["chapter", "chapter", "synthesis"]);
    expect(
      llm.made.filter((one) => one.turn === "chapter").map((one) => chapterOf(one.prompt)),
    ).toEqual(["Four", "Five"]);
    // The three that were kept reach the editor without being asked for again.
    expect(llm.made.at(-1)?.prompt).toContain("kept One");
    expect(llm.made.at(-1)?.prompt).toContain("kept Three");
    // The meter starts from what was already done, not from zero.
    expect(progress(h.events)).toEqual(["3 of 5", "4 of 5", "5 of 5"]);
    h.db.close();
  });

  // §Q54: one sub-agent exhausting its retries fails the whole stage; the outputs of the
  // ones that finished are kept for the resume.
  it("fails the stage when a sub-agent fails, keeping what the others found", async () => {
    const h = harness();
    const llm = fake((turn, prompt) => {
      if (turn === "chapter" && chapterOf(prompt) === "Materials") {
        throw new Error("the provider gave up");
      }
      return threeChapters(turn, prompt);
    });

    await expect(runResearch(h.deps, h.context, llm.providers)).rejects.toThrow(
      "the provider gave up",
    );

    expect(llm.made.some((one) => one.turn === "synthesis")).toBe(false);
    expect(piecesOf(h.db, "s1", "chapter").map((piece) => piece.state)).toEqual([
      "done",
      "failed",
      "done",
    ]);
    expect(outputsOf(h.db, "p1")).toEqual([]);
    h.db.close();
  });

  // §Q47: no fallback to model knowledge, and the sentence the user reads is fixed.
  it("fails with the doc's own sentence when the model cannot search the web", async () => {
    const h = harness();
    const llm = fake((turn) => {
      if (turn === "chapter") {
        throw providerError({
          kind: "unsupported",
          message: "this model has no web plugin",
        });
      }
      return "History\nMaterials\nKnots";
    });

    await expect(runResearch(h.deps, h.context, llm.providers)).rejects.toThrow(
      webResearchUnsupported,
    );
    expect(webResearchUnsupported).toBe("web research unsupported by this model");
    h.db.close();
  });

  // §Q50: an empty answer is a failed attempt, so it reaches the caller as a failure
  // rather than being stored as a chapter with nothing in it.
  it("refuses an empty sub-agent answer and one with no Sources list", async () => {
    const empty = harness();
    await expect(
      runResearch(
        empty.deps,
        empty.context,
        fake((turn) => (turn === "planner" ? "One" : "")).providers,
      ),
    ).rejects.toThrow("answered with nothing");
    empty.db.close();

    const bare = harness();
    await expect(
      runResearch(
        bare.deps,
        bare.context,
        fake((turn) => (turn === "planner" ? "One" : "Notes with no list.")).providers,
      ),
    ).rejects.toThrow("answered with no Sources list");
    bare.db.close();
  });

  it("refuses a planner that named no chapters", async () => {
    const h = harness();

    await expect(runResearch(h.deps, h.context, fake(() => "   ").providers)).rejects.toThrow(
      "the planner named no chapters",
    );
    h.db.close();
  });

  it("refuses to start a run with no provider or no rendered prompt", async () => {
    const h = harness({ rendered: {} });

    await expect(runResearch(h.deps, h.context, fake(threeChapters).providers)).rejects.toThrow(
      "no LLM provider or no rendered article prompt",
    );
    h.db.close();
  });
});

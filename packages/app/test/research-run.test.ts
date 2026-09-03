import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { FakeLlm } from "../src/adapters/fake/llm.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import type { ManualClock } from "../src/kernel/clock.fake.js";
import { manualClock } from "../src/kernel/clock.fake.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import type { ProjectEvent } from "../src/kernel/events.js";
import type { Ids } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import type { Paths } from "../src/kernel/paths.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import type { LlmCompletion } from "../src/kernel/ports/llm.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { attemptsOf, sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import type { StageContext } from "../src/kernel/runner/index.js";
import { createRunner } from "../src/kernel/runner/index.js";
import { piecesOf } from "../src/kernel/runner/piece-repo.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import { claimStage, finishStage, stagesOf } from "../src/slices/admission/repo.js";
import { runResearch, webResearchUnsupported } from "../src/slices/research/run.js";
import type { RecordEvent } from "../src/slices/telemetry/model.js";
import type { Counted } from "../src/slices/telemetry/record.fake.js";
import { recordingCounter } from "../src/slices/telemetry/record.fake.js";

// The research stage against the real attempt wrapper: what `slices/research/run.test.ts`
// cannot show, because a slice may not reach a registry or an adapter. Nothing here calls
// a provider; `adapters/fake/llm.ts` answers every request (06-testing Doubles).

const silent: Log = { write: (): void => {} };

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
  llm: { provider: "fake-llm", model: "fake-model" },
  imagePrompts: [],
  values: { topic: "rope" },
  provided: {},
  silenceGapSeconds: 3,
  rendered: { article: "Write about rope." },
};

interface Harness {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly clock: ManualClock;
  readonly events: readonly ProjectEvent[];
  readonly deps: {
    readonly db: DatabaseSync;
    readonly paths: Paths;
    readonly ids: Ids;
    readonly clock: ManualClock;
    readonly log: Log;
    readonly count: RecordEvent;
  };
  readonly counted: Counted;
  readonly context: StageContext;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-research-int-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(join(paths.dataDir, "test.db"));
  const clock = manualClock("2026-09-02T10:00:00.000Z");
  migrate(db, clock);
  db.prepare("INSERT INTO projects VALUES ('p1','Rope','16:9',?,?,?)").run(
    JSON.stringify(config),
    "2026-09-01",
    "2026-09-01",
  );
  db.exec(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','research','generate','pending')",
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
    clock,
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

function registry(llm: FakeLlm): Registry {
  return {
    llm: () => llm,
    tts: () => {
      throw new Error("no tts adapter");
    },
    image: () => {
      throw new Error("no image adapter");
    },
    list: () => Promise.resolve([]),
  };
}

function turnOf(req: LlmCompletion): "planner" | "chapter" | "synthesis" {
  const prompt = req.messages[0]?.content ?? "";
  if (prompt.startsWith("You are planning")) {
    return "planner";
  }
  return prompt.startsWith("You are researching") ? "chapter" : "synthesis";
}

// Two chapters, each answering with its notes and a Sources list, and a synthesis that
// does the same. `chapter` is what each test replaces to break one of them.
function script(chapter: (req: LlmCompletion, attempt: number) => readonly string[]) {
  return (req: LlmCompletion, attempt: number): readonly string[] => {
    const turn = turnOf(req);
    if (turn === "planner") {
      return ["History\nMaterials"];
    }
    if (turn === "chapter") {
      return chapter(req, attempt);
    }
    return ["All of it.\n\nSources\nhttps://example.test/all"];
  };
}

const good: readonly string[] = ["Found it.\n\nSources\nhttps://example.test/one"];

function run(h: Harness, llm: FakeLlm): Promise<void> {
  return runResearch(
    h.deps,
    h.context,
    stageProviders(
      {
        registry: registry(llm),
        attempts: sqliteAttempts(h.db, h.deps.ids),
        clock: h.clock,
        log: silent,
      },
      h.context,
    ),
  );
}

function attemptsPerPiece(db: DatabaseSync): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of attemptsOf(db, "s1")) {
    const key = row.pieceId ?? "stage";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

describe("the research stage through the attempt wrapper", () => {
  it("researches every chapter and stores the notes", async () => {
    const h = harness();
    const llm = fakeLlm({ reply: script(() => good) });

    await h.clock.settle(run(h, llm));

    expect(llm.calls()).toBe(4);
    expect(existsSync(join(h.paths.projects, "p1", "research.txt"))).toBe(true);
    expect(readFileSync(join(h.paths.projects, "p1", "research.txt"), "utf8")).toBe(
      "All of it.\n\nSources\nhttps://example.test/all",
    );
    expect(piecesOf(h.db, "s1", "chapter").map((piece) => piece.state)).toEqual(["done", "done"]);
    // logic/16 steps 2 and 3: one event for the stage, carrying the tokens of all four
    // calls under the provider and model that were asked. The fake reports 11 in and 22
    // out per call.
    expect(h.counted.events()).toEqual([
      {
        type: "stage.completed",
        counters: {
          stage: "research",
          provider: "fake-llm",
          model: "fake-model",
          tokensIn: 44,
          tokensOut: 88,
        },
      },
    ]);
    h.db.close();
  });

  // logic/16 step 3 with §Q131: "provider reports no token usage → 0 recorded, never
  // estimated". The stage still records, so the Usage page shows the call happened.
  it("records zero tokens for a provider that reports no usage", async () => {
    const h = harness();
    const llm = fakeLlm({ reply: script(() => good), usage: null });

    await h.clock.settle(run(h, llm));

    expect(h.counted.events().map((one) => one.counters)).toEqual([
      {
        stage: "research",
        provider: "fake-llm",
        model: "fake-model",
        tokensIn: 0,
        tokensOut: 0,
      },
    ]);
    h.db.close();
  });

  // §Q50: "Empty response from any call → counts as a failed attempt", so the wrapper
  // sees a failure and runs the retry policy of `logic/01` step 6 over it.
  it("retries a sub-agent that answers nothing, four times, then fails the stage", async () => {
    const h = harness();
    const llm = fakeLlm({
      reply: script((req) => (chapterOf(req) === "Materials" ? [] : good)),
    });

    await expect(h.clock.settle(run(h, llm))).rejects.toThrow("answered with nothing");

    const counts = attemptsPerPiece(h.db);
    const failing = Object.entries(counts).find(([, count]) => count === 4);
    expect(failing).toBeDefined();
    expect(Object.values(counts).toSorted()).toEqual([1, 1, 4]);
    // The stage never completed, so it counted nothing: logic/16 step 2 puts one event on
    // the stage completing, and a failed attempt reports no usage to add.
    expect(h.counted.events()).toEqual([]);
    expect(h.clock.waits).toContain(2000);
    expect(h.clock.waits).toContain(8000);
    expect(h.clock.waits).toContain(30_000);
    h.db.close();
  });

  // §Q55: the same for an answer that carries no Sources list.
  it("retries a sub-agent whose notes carry no Sources list", async () => {
    const h = harness();
    const llm = fakeLlm({
      reply: script((req) =>
        chapterOf(req) === "History" ? ["Notes with no list at the end."] : good,
      ),
    });

    await expect(h.clock.settle(run(h, llm))).rejects.toThrow("answered with no Sources list");

    expect(Object.values(attemptsPerPiece(h.db)).toSorted()).toEqual([1, 1, 4]);
    h.db.close();
  });

  // §Q50 again, for the last call rather than a sub-agent's.
  it("retries a synthesis that answers with no Sources list", async () => {
    const h = harness();
    const llm = fakeLlm({
      reply: (req: LlmCompletion): readonly string[] => {
        const turn = turnOf(req);
        if (turn === "planner") {
          return ["History"];
        }
        return turn === "chapter" ? good : ["Just prose."];
      },
    });

    await expect(h.clock.settle(run(h, llm))).rejects.toThrow(
      "the synthesis answered with no Sources list",
    );

    // One planner attempt, one chapter attempt, four synthesis attempts.
    expect(attemptsOf(h.db, "s1")).toHaveLength(6);
    h.db.close();
  });

  // §Q47: the adapter says the model cannot ground on the web, the wrapper makes that
  // terminal, and the user reads the doc's own sentence.
  it("stops at once when the model cannot search the web", async () => {
    const h = harness();
    const llm = fakeLlm({
      webSearchUnsupported: true,
      reply: script(() => good),
    });

    await expect(h.clock.settle(run(h, llm))).rejects.toThrow(webResearchUnsupported);

    // The planner call, then one refused sub-agent call each: no attempt was repeated.
    expect(Object.values(attemptsPerPiece(h.db)).toSorted()).toEqual([1, 1, 1]);
    expect(h.clock.waits).not.toContain(2000);
    expect(attemptsOf(h.db, "s1").at(-1)?.outcome).toBe("unsupported");
    h.db.close();
  });

  // The runner drives it end to end: the stage reaches `done` and says so.
  it("reaches done through the runner", async () => {
    const h = harness();
    const llm = fakeLlm({ reply: script(() => good) });
    const events: ProjectEvent[] = [];
    const runner = createRunner({
      stages: {
        stagesOf: (projectId) => stagesOf(h.db, projectId),
        claim: (stageId) => claimStage(h.db, stageId, h.clock.now().toISOString()),
        finish: (stageId, state, reason) =>
          finishStage(h.db, stageId, state, reason, h.clock.now().toISOString()),
      },
      runs: {
        research: (context) =>
          runResearch(
            h.deps,
            context,
            stageProviders(
              {
                registry: registry(llm),
                attempts: sqliteAttempts(h.db, h.deps.ids),
                clock: h.clock,
                log: silent,
              },
              context,
            ),
          ),
      },
      emit: (_projectId, event) => {
        events.push(event);
      },
      emitRunningCount: () => {},
      log: silent,
    });

    runner.tick("p1");
    await h.clock.settle(runner.settled());

    expect(h.db.prepare("SELECT state, failure_reason FROM stages WHERE id = 's1'").get()).toEqual({
      state: "done",
      failure_reason: null,
    });
    expect(
      events.filter((event) => event.type === "stage.progress").map((event) => event.current),
    ).toEqual([0, 1, 2]);
    h.db.close();
  });
});

function chapterOf(req: LlmCompletion): string {
  const prompt = req.messages[0]?.content ?? "";
  return /Research this chapter and no other: (.+)/.exec(prompt)?.[1] ?? "";
}

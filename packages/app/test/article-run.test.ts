import { mkdtempSync, readFileSync } from "node:fs";
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
import { piecesOf } from "../src/kernel/runner/piece-repo.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import type { ArticleDeps } from "../src/slices/article/run.js";
import { runArticle } from "../src/slices/article/run.js";

// The article stage against the real attempt wrapper: what `slices/article/run.test.ts`
// cannot show, because a slice may not reach a registry or an adapter. Nothing here calls
// a provider; `adapters/fake/llm.ts` answers every request (06-testing Doubles).

const silent: Log = { write: (): void => {} };

const config = {
  title: "Rope",
  format: "16:9",
  sources: {
    research: "off",
    article: "generate",
    audio: "generate",
    images: "off",
    thumbnail: "off",
    video: "generate",
  },
  llm: { provider: "fake-llm", model: "fake-model" },
  imagePrompts: [],
  intro: { name: "Hook", mode: "llm" },
  values: { topic: "rope" },
  provided: {},
  silenceGapSeconds: 3,
  rendered: { article: "Write about rope.", intro: "Write a hook." },
};

interface Harness {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly clock: ManualClock;
  readonly events: readonly ProjectEvent[];
  readonly deps: ArticleDeps;
  readonly context: StageContext;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-article-int-")));
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
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','article','generate','running')",
  );
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  const events: ProjectEvent[] = [];
  return {
    db,
    paths,
    clock,
    events,
    deps: { db, paths, ids, clock, log: silent },
    context: {
      stage: { id: "s1", projectId: "p1", kind: "article", state: "running" },
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

function run(h: Harness, llm: FakeLlm): Promise<void> {
  return runArticle(
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

// The wrapper arms the 120 s idle timeout on the same clock, so the schedule of
// `logic/01` step 6 is what is left once those are taken out.
function backoff(waits: readonly number[]): readonly number[] {
  return waits.filter((ms) => ms !== 120_000);
}

function isHook(req: LlmCompletion): boolean {
  return (req.messages[0]?.content ?? "").startsWith("Write a hook.");
}

describe("the article stage through the attempt wrapper", () => {
  it("streams the article, splits its end matter and writes the intro after it", async () => {
    const h = harness();
    const llm = fakeLlm({
      reply: (req: LlmCompletion): readonly string[] =>
        isHook(req)
          ? ["Rope holds worlds."]
          : [
              "# Rope\n\nRope is **twisted** fibre.\n\n",
              "## Sources Consulted\n\n- https://x.test\n",
            ],
    });

    await h.clock.settle(run(h, llm));

    expect(llm.calls()).toBe(2);
    const file = (name: string): string => readFileSync(join(h.paths.projects, "p1", name), "utf8");
    expect(file("article.md")).toBe(
      "# Rope\n\nRope is **twisted** fibre.\n\n## Sources Consulted\n\n- https://x.test\n",
    );
    expect(file("article.txt")).toBe("Rope\n\nRope is twisted fibre.\n");
    expect(file("sources.txt")).toBe("## Sources Consulted\n\n- https://x.test\n");
    // Every chunk the adapter yielded reached the page, in order.
    expect(
      h.events.filter((event) => event.type === "article.delta").map((event) => event.text),
    ).toEqual([
      "# Rope\n\nRope is **twisted** fibre.\n\n",
      "## Sources Consulted\n\n- https://x.test\n",
    ]);
    const segments = piecesOf(h.db, "s1", "segment");
    expect(segments[0]?.payload).toContain("Rope holds worlds.");
    h.db.close();
  });

  // §Q59: three continuations, and the fourth truncation is a failed attempt the wrapper
  // retries under `logic/01` step 6 before the stage fails.
  it("continues three times, then retries the last continuation four times and fails", async () => {
    const h = harness();
    const llm = fakeLlm({ deltas: ["on and on"], finishReason: "length" });

    await expect(h.clock.settle(run(h, llm))).rejects.toThrow(
      "the article was still unfinished after 3 continuations",
    );

    // One article call, two continuations that were accepted, and four attempts at the
    // third, which is the one carrying the rule.
    expect(llm.calls()).toBe(7);
    expect(attemptsOf(h.db, "s1")).toHaveLength(7);
    expect(backoff(h.clock.waits)).toEqual([2000, 8000, 30_000]);
    h.db.close();
  });

  // §Q61: an empty response is a failed attempt, so the wrapper asks again rather than
  // storing an empty article.
  it("retries an empty answer and keeps the article the next attempt wrote", async () => {
    const h = harness();
    const llm = fakeLlm({
      reply: (req: LlmCompletion, attempt: number): readonly string[] => {
        if (isHook(req)) {
          return ["Rope holds worlds."];
        }
        return attempt === 1 ? [] : ["# Rope\n\nAll of it.\n"];
      },
    });

    await h.clock.settle(run(h, llm));

    expect(readFileSync(join(h.paths.projects, "p1", "article.md"), "utf8")).toBe(
      "# Rope\n\nAll of it.\n",
    );
    expect(attemptsOf(h.db, "s1").map((row) => row.outcome)).toEqual(["other", "ok", "ok"]);
    expect(backoff(h.clock.waits)).toEqual([2000]);
    h.db.close();
  });
});

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { LlmEvent, Message } from "../../kernel/ports/llm.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import { insertPiece, piecesOf } from "../../kernel/runner/piece-repo.js";
import type { LlmAnswer, LlmCall, StageProviders } from "../../kernel/runner/providers.js";
import type { RunConfig } from "../admission/model.js";
import { outputsOf } from "../storage/repo.js";
import type { Counted } from "../telemetry/record.fake.js";
import { recordingCounter } from "../telemetry/record.fake.js";
import type { ArticleDeps, SegmentText } from "./run.js";
import { runArticle } from "./run.js";

// What the narration stage will read off a `segment` row, parsed
// here so a change to the payload shape breaks this test rather than that stage.
const segmentText = z.object({
  category: z.enum(["intro", "outro"]),
  name: z.string(),
  mode: z.enum(["text", "llm"]),
  text: z.string(),
});

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const silent: Log = { write: (): void => {} };

const article = `# Rope

Rope is **twisted** fibre.

## Sources Consulted

- https://example.test/rope

## Pronunciation Glossary

- bowline /ˈboʊlɪn/
`;

const config: RunConfig = {
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
  rendered: { article: "Write about rope." },
};

interface Harness {
  readonly deps: ArticleDeps;
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly context: StageContext;
  readonly events: readonly ProjectEvent[];
  readonly fileOf: (name: string) => string;
  readonly counted: Counted;
}

function harness(over: Partial<RunConfig> = {}): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-article-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(join(paths.dataDir, "test.db"));
  migrate(db, clock);
  db.prepare("INSERT INTO projects VALUES ('p1','Rope','16:9',?,?,?)").run(
    JSON.stringify({ ...config, ...over }),
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
  const counted = recordingCounter();
  return {
    db,
    paths,
    events,
    counted,
    deps: { db, paths, ids, clock, log: silent, count: counted.count },
    fileOf: (name: string): string => readFileSync(join(paths.projects, "p1", name), "utf8"),
    context: {
      stage: { id: "s1", projectId: "p1", kind: "article", state: "running" },
      signal: new AbortController().signal,
      emit: (event: ProjectEvent): void => {
        events.push(event);
      },
    },
  };
}

// The research stage's output as the article stage finds it: a row and a file.
function withNotes(h: Harness, text: string): void {
  mkdirSync(join(h.paths.projects, "p1"), { recursive: true });
  writeFileSync(join(h.paths.projects, "p1", "research.txt"), text);
  h.db
    .prepare(
      "INSERT INTO outputs VALUES ('o1','p1','research','notes','research.txt',NULL,?,NULL,'{}',?)",
    )
    .run(text.length, "2026-09-01");
}

interface Made {
  readonly prompt: string;
}

interface Fake {
  readonly providers: StageProviders;
  readonly made: readonly Made[];
}

// The wrapped calls of `kernel/runner/providers.ts`, scripted per turn and applying
// `check` exactly as the wrapper does.
function fake(script: (prompt: string) => string): Fake {
  const made: Made[] = [];
  const providers: StageProviders = {
    llm: (call: LlmCall, onEvent?: (event: LlmEvent) => void) => {
      const prompt = call.messages.map((message: Message) => message.content).join("\n");
      made.push({ prompt });
      const text = script(prompt);
      for (const piece of text.split("\n")) {
        onEvent?.({ type: "delta", text: `${piece}\n` });
      }
      const answer: LlmAnswer = { text, usage: null, finishReason: "stop" };
      const unusable = call.check?.(answer);
      return unusable === undefined ? Promise.resolve(answer) : Promise.reject(new Error(unusable));
    },
    tts: () => Promise.reject(new Error("the article stage must not narrate")),
    image: () => Promise.reject(new Error("the article stage must not draw")),
    forPiece: (): StageProviders => providers,
  };
  return { providers, made };
}

function segmentOf(piece: StagePiece | undefined): SegmentText {
  return segmentText.parse(JSON.parse(piece?.payload ?? "null"));
}

const writes = (text: string): ((prompt: string) => string) => {
  return (): string => text;
};

describe("runArticle", () => {
  it("stores the markdown as written, the narration source without its end matter", async () => {
    const h = harness();

    await runArticle(h.deps, h.context, fake(writes(article)).providers);

    expect(h.fileOf("article.md")).toBe(article);
    const spoken = h.fileOf("article.txt");
    expect(spoken).toContain("Rope is twisted fibre.");
    expect(spoken).not.toContain("Sources Consulted");
    expect(spoken).not.toContain("bowline");
    expect(spoken).not.toContain("#");
    expect(h.fileOf("sources.txt")).toBe("## Sources Consulted\n\n- https://example.test/rope\n\n");
    expect(h.fileOf("glossary.txt")).toBe("## Pronunciation Glossary\n\n- bowline /ˈboʊlɪn/\n");
    expect(
      outputsOf(h.db, "p1")
        .map((output) => output.role)
        .toSorted(),
    ).toEqual(["article_md", "article_txt", "glossary", "instructions", "sources"]);
    h.db.close();
  });

  it("writes no sources or glossary file when the article has neither section", async () => {
    const h = harness();

    await runArticle(h.deps, h.context, fake(writes("# Rope\n\nAll of it.\n")).providers);

    expect(
      outputsOf(h.db, "p1")
        .map((output) => output.role)
        .toSorted(),
    ).toEqual(["article_md", "article_txt", "instructions"]);
    h.db.close();
  });

  it("puts the research notes under the fixed header before the prompt", async () => {
    const h = harness();
    withNotes(h, "Rope is old.\n\nSources\nhttps://example.test/rope");
    const llm = fake(writes(article));

    await runArticle(h.deps, h.context, llm.providers);

    expect(llm.made[0]?.prompt).toBe(
      "Research notes\n\nRope is old.\n\nSources\nhttps://example.test/rope\n\nWrite about rope.",
    );
    h.db.close();
  });

  it("sends the prompt alone when research left no notes", async () => {
    const h = harness();
    const llm = fake(writes(article));

    await runArticle(h.deps, h.context, llm.providers);

    expect(llm.made[0]?.prompt).toBe("Write about rope.");
    h.db.close();
  });

  it("streams the article into the page as it arrives", async () => {
    const h = harness();

    await runArticle(h.deps, h.context, fake(writes("# Rope\n\nAll of it.")).providers);

    const deltas = h.events.filter((event) => event.type === "article.delta");
    expect(deltas.map((event) => event.text)).toEqual(["# Rope\n", "\n", "All of it.\n"]);
    expect(deltas.every((event) => event.projectId === "p1")).toBe(true);
    h.db.close();
  });

  it("stores the instructions it sent, the continuations among them", async () => {
    const h = harness();

    await runArticle(h.deps, h.context, fake(writes(article)).providers);

    const sent = h.fileOf("instructions-article.txt");
    expect(sent).toContain("=== Article ===");
    expect(sent).toContain("Write about rope.");
    h.db.close();
  });

  it("stores a text-mode intro and outro as rendered, without a call", async () => {
    const h = harness({
      intro: { name: "Standard", mode: "text" },
      outro: { name: "Sign-off", mode: "text" },
      rendered: { article: "Write about rope.", intro: "Welcome back.", outro: "See you." },
    });
    const llm = fake(writes(article));

    await runArticle(h.deps, h.context, llm.providers);

    expect(llm.made).toHaveLength(1);
    const segments = piecesOf(h.db, "s1", "segment");
    expect(segments.map((piece) => segmentOf(piece).text)).toEqual(["Welcome back.", "See you."]);
    expect(segments.map((piece) => piece.state)).toEqual(["done", "done"]);
    // Each intro/outro text is still counted: a text-mode entry made no call, so its event
    // names no provider and reports zero tokens rather than an estimate. The whole payload
    // is asserted, because what is absent is the point.
    expect(h.counted.events().map((one) => one.counters)).toEqual([
      // The double answers with no usage, which records 0 rather than an estimate.
      {
        stage: "article",
        provider: "openrouter",
        model: "openai/gpt-5",
        tokensIn: 0,
        tokensOut: 0,
      },
      { stage: "article", segment: "intro", tokensIn: 0, tokensOut: 0 },
      { stage: "article", segment: "outro", tokensIn: 0, tokensOut: 0 },
    ]);
    h.db.close();
  });

  it("writes an LLM-mode intro after the article, from the article's plain text", async () => {
    const h = harness({
      intro: { name: "Hook", mode: "llm" },
      rendered: { article: "Write about rope.", intro: "Write a hook for this video." },
    });
    const llm = fake((prompt) =>
      prompt.startsWith("Write a hook") ? "Rope holds worlds." : article,
    );

    await runArticle(h.deps, h.context, llm.providers);

    expect(llm.made).toHaveLength(2);
    const asked = llm.made[1]?.prompt ?? "";
    expect(asked).toContain("Write a hook for this video.");
    expect(asked).toContain("Rope");
    expect(asked).toContain("topic: rope");
    // The article it is handed is the narration source: plain, and without end matter.
    expect(asked).toContain("Rope is twisted fibre.");
    expect(asked).not.toContain("**twisted**");
    expect(asked).not.toContain("bowline");

    const segments = piecesOf(h.db, "s1", "segment");
    expect(segments).toHaveLength(1);
    expect(segmentOf(segments[0])).toEqual({
      category: "intro",
      name: "Hook",
      mode: "llm",
      text: "Rope holds worlds.",
    });
    expect(h.fileOf("instructions-article.txt")).toContain("=== Intro ===");
    h.db.close();
  });

  it("fails the attempt when an LLM-mode entry answers with nothing", async () => {
    const h = harness({
      intro: { name: "Hook", mode: "llm" },
      rendered: { article: "Write about rope.", intro: "Write a hook for this video." },
    });
    const llm = fake((prompt) => (prompt.startsWith("Write a hook") ? "  " : article));

    await expect(runArticle(h.deps, h.context, llm.providers)).rejects.toThrow(
      /intro answered with nothing/,
    );
    h.db.close();
  });

  it("replaces the segment a previous run of the stage wrote", async () => {
    const h = harness({
      intro: { name: "Standard", mode: "text" },
      rendered: { article: "Write about rope.", intro: "Welcome back." },
    });
    insertPiece(h.db, {
      id: "old",
      stageId: "s1",
      kind: "segment",
      idx: 1,
      state: "done",
      payload: JSON.stringify({
        category: "intro",
        name: "Standard",
        mode: "text",
        text: "Stale.",
      }),
    });

    await runArticle(h.deps, h.context, fake(writes(article)).providers);

    const segments = piecesOf(h.db, "s1", "segment");
    expect(segments).toHaveLength(1);
    expect(segmentOf(segments[0]).text).toBe("Welcome back.");
    h.db.close();
  });

  it("refuses a run admission should never have accepted", async () => {
    const h = harness({ rendered: {} });

    await expect(runArticle(h.deps, h.context, fake(writes(article)).providers)).rejects.toThrow(
      /no LLM provider or no rendered article prompt/,
    );
    h.db.close();
  });
});

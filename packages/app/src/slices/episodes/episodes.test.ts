import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { LlmPort } from "../../kernel/ports/llm.js";
import { standaloneOver } from "../../kernel/runner/standalone.fake.js";
import { standaloneLlm } from "../../kernel/runner/standalone.js";
import type { RunDraft } from "../admission/model.js";
import { startRun } from "../admission/start.js";
import type { CastSnapshot } from "../channels/model.js";
import { defaultChannelId } from "../channels/model.js";
import { setProjectChannel } from "../channels/repo.js";
import { createCastMember, createChannel } from "../channels/service.js";
import { createStandaloneMeter } from "../run-cost/meter.js";
import type { StorageDeps } from "../storage/staging.js";
import { earlierEpisodesMax, relatedEpisodes, withEarlierEpisodes } from "./related.js";
import { type EpisodeMemory, memoriesOfChannel } from "./repo.js";
import { channelEpisodes, deleteMemory, editMemory, setEpisodeMemory } from "./service.js";
import {
  clampSummary,
  createEpisodeMemoryWatcher,
  type EpisodeLlmCall,
  type EpisodeSummaryDeps,
  summarizeEpisode,
} from "./summarize.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");

function harness(port?: LlmPort) {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-episodes-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  const logged: string[] = [];
  const log: Log = {
    write: (_level, event, fields) => {
      logged.push(`${event}: ${fields?.detail ?? ""}`);
    },
  };
  const storage: StorageDeps = { db, paths, ids, clock, log, emit: (): void => {} };
  const calls: EpisodeLlmCall[] = [];
  let answer: () => Promise<string> = async () => "Tiamat woke under the mountain.";
  const summary: EpisodeSummaryDeps = {
    db,
    paths,
    clock,
    log,
    uuid: randomUUID,
    llm: async (call) => {
      calls.push(call);
      if (port !== undefined)
        return standaloneLlm(
          standaloneOver(
            { llm: port },
            {
              clock,
              log,
              meter: createStandaloneMeter({
                db,
                ids,
                clock,
                catalogue: () => ({
                  schemaVersion: 1,
                  updatedAt: "2026-09-26",
                  providers: {},
                  llm: [],
                  tts: [],
                  image: [],
                }),
              }),
            },
          ),
          call,
        );
      return {
        text: await answer(),
        usage: { inputTokens: 900, outputTokens: 60 },
      };
    },
  };
  return {
    db,
    storage,
    summary,
    calls,
    logged,
    answers: (next: () => Promise<string>) => {
      answer = next;
    },
  };
}

function draft(over: Partial<RunDraft> = {}): RunDraft {
  return {
    title: "Tiamat's Lair",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "off",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
    llm: { provider: "text", model: "text-model" },
    imagePrompts: [],
    values: {},
    provided: { article: "Tiamat sleeps beneath the mountain. Bahamut watches." },
    silenceGapSeconds: 0,
    imageSeconds: 15,
    zoomPercent: 22.5,
    motionStyle: "zoom",
    edgeSilenceSeconds: 0,
    ...over,
  };
}

function memory(title: string, cast: readonly string[] = [], at = "2026-09-01"): EpisodeMemory {
  return {
    id: randomUUID(),
    channelId: defaultChannelId,
    projectId: randomUUID(),
    title,
    summary: `About ${title}.`,
    cast,
    source: "generated",
    createdAt: at,
    updatedAt: at,
  };
}

const castOf = (name: string, ...aliases: string[]): CastSnapshot => ({
  name,
  aliases,
  description: "",
  images: [],
});

describe("the episode summary", () => {
  it("is written once per article with the project's model, asked for its channel", async () => {
    const h = harness();
    // A fresh install's default channel has episode memory on (migration 0039).
    const created = createCastMember({ db: h.db, clock, uuid: randomUUID }, defaultChannelId, {
      id: randomUUID(),
      kind: "character",
      name: "Bahamut",
    });
    expect(created.ok).toBe(true);
    const run = startRun(h.storage, draft(), {});
    expect(await summarizeEpisode(h.summary, run.project.id)).toBe("saved");
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ provider: "text", model: "text-model" });
    expect(h.calls[0]?.messages.at(-1)?.content).toContain("Tiamat sleeps beneath the mountain.");
    expect(h.calls[0]).toMatchObject({
      owner: { kind: "channel", id: defaultChannelId },
      purpose: "episode-summary",
    });
    const [saved] = memoriesOfChannel(h.db, defaultChannelId);
    expect(saved).toMatchObject({
      projectId: run.project.id,
      title: "Tiamat's Lair",
      summary: "Tiamat woke under the mountain.",
      cast: ["Bahamut"],
      source: "generated",
    });
    // The same article finished again asks nothing.
    expect(await summarizeEpisode(h.summary, run.project.id)).toBe("unchanged");
    expect(h.calls).toHaveLength(1);
    // An edited summary is the user's.
    const edited = editMemory(h.summary, defaultChannelId, saved?.id ?? "", {
      summary: "  Mine.  ",
    });
    expect(edited).toMatchObject({ ok: true, value: { summary: "Mine.", source: "edited" } });
    h.db.prepare("UPDATE episode_memories SET recipe='old' WHERE id=?").run(saved?.id ?? "");
    expect(await summarizeEpisode(h.summary, run.project.id)).toBe("edited");
    expect(h.calls).toHaveLength(1);
  });

  it("is skipped while the channel's setting is off, and a failure never throws", async () => {
    const h = harness();
    const run = startRun(h.storage, draft(), {});
    expect(setEpisodeMemory(h.summary, defaultChannelId, { enabled: false })).toMatchObject({
      ok: true,
      value: { enabled: false },
    });
    expect(await summarizeEpisode(h.summary, run.project.id)).toBe("off");
    expect(h.calls).toHaveLength(0);
    setEpisodeMemory(h.summary, defaultChannelId, { enabled: true });
    h.answers(async () => {
      throw new Error("signed out");
    });
    expect(await summarizeEpisode(h.summary, run.project.id)).toBe("failed");
    expect(h.logged.join("\n")).toContain("signed out");
    expect(memoriesOfChannel(h.db, defaultChannelId)).toEqual([]);
  });

  it("is metered on its channel's run cost, not the finished project's", async () => {
    let asked = 0;
    const h = harness({
      id: "text",
      capabilities: { streams: true, reportsUsage: true, webSearch: false },
      models: () => Promise.resolve([]),
      complete: async function* () {
        asked += 1;
        if (asked === 1) throw new TypeError("fetch failed");
        yield { type: "delta", text: "Tiamat woke under the mountain." };
        yield {
          type: "done",
          usage: { inputTokens: 900, outputTokens: 60 },
          finishReason: "stop",
        };
      },
    });
    const lore = randomUUID();
    const channel = createChannel(
      { db: h.db, clock, uuid: randomUUID },
      { id: lore, name: "Lore" },
    );
    expect(channel.ok).toBe(true);
    const run = startRun(h.storage, draft(), {});
    setProjectChannel(h.db, run.project.id, lore);
    expect(await summarizeEpisode(h.summary, run.project.id)).toBe("saved");
    expect(asked).toBe(2);
    expect(
      h.db
        .prepare(
          "SELECT owner_kind, owner_id, channel_id, purpose, provider, model, tokens_in, tokens_out FROM standalone_usage",
        )
        .all(),
    ).toEqual([
      {
        owner_kind: "channel",
        owner_id: lore,
        channel_id: lore,
        purpose: "episode-summary",
        provider: "text",
        model: "text-model",
        tokens_in: 900,
        tokens_out: 60,
      },
    ]);
    expect(h.db.prepare("SELECT count(*) AS n FROM provider_usage").get()).toEqual({ n: 0 });
  });

  it("is written in the background when a project reaches done, and only then", async () => {
    const h = harness();
    const run = startRun(h.storage, draft(), {});
    const watcher = createEpisodeMemoryWatcher(h.summary);
    watcher.observe({ type: "project.state", projectId: run.project.id, state: "running" });
    watcher.observe({ type: "project.updated", projectId: run.project.id });
    await watcher.settled();
    expect(h.calls).toHaveLength(0);
    watcher.observe({ type: "project.state", projectId: run.project.id, state: "done" });
    watcher.observe({ type: "project.state", projectId: run.project.id, state: "done" });
    await watcher.settled();
    expect(h.calls).toHaveLength(1);
    expect(memoriesOfChannel(h.db, defaultChannelId)).toHaveLength(1);
  });

  it("is cut to 150 words", () => {
    const long = Array.from({ length: 200 }, (_, index) => `w${String(index)}`).join(" ");
    const clamped = clampSummary(long);
    expect(clamped.split(" ")).toHaveLength(150);
    expect(clamped.endsWith("…")).toBe(true);
  });
});

describe("related earlier episodes", () => {
  it("rank shared cast first, then shared title words, newest first among equals, at most 5", () => {
    const cast = [castOf("Tiamat", "Queen of Dragons"), castOf("Vecna")];
    const memories = [
      memory("Vecna's Rise", ["Vecna"]),
      memory("Red Dragons of Faerûn"),
      memory("Where Dragons Sleep", ["Tiamat"]),
      memory("Mind Flayers"),
    ];
    const related = relatedEpisodes(memories, cast, "The Queen of Dragons returns", "Q");
    expect(related.map((row) => row.title)).toEqual([
      "Where Dragons Sleep",
      "Red Dragons of Faerûn",
    ]);
    const many = Array.from({ length: 8 }, (_, index) =>
      memory(`Episode ${String(index)}`, ["Tiamat"]),
    );
    expect(relatedEpisodes(many, cast, "Tiamat again", "X")).toHaveLength(earlierEpisodesMax);
  });

  it("ignore the template's words most titles share, and a remake of the same title", () => {
    const memories = [
      memory("D&D Lore: Tiamat"),
      memory("D&D Lore: Vecna"),
      memory("D&D Lore: Bahamut"),
    ];
    expect(relatedEpisodes(memories, [], "D&D Lore: Strahd", "D&D Lore: Strahd")).toEqual([]);
    expect(
      relatedEpisodes(memories, [], "D&D Lore: Tiamat", "D&D Lore: Tiamat").map((m) => m.title),
    ).toEqual([]);
    expect(
      relatedEpisodes(memories, [], "D&D Lore: Tiamat and Vecna", "x").map((m) => m.title),
    ).toEqual(["D&D Lore: Tiamat", "D&D Lore: Vecna"]);
  });
});

describe("the earlier episodes block", () => {
  it("leaves the prompt as it was without earlier episodes", () => {
    expect(withEarlierEpisodes("Write.", undefined)).toBe("Write.");
    expect(withEarlierEpisodes("Write.", [])).toBe("Write.");
    expect(withEarlierEpisodes("Write.", [{ title: "A", summary: "One\n two." }])).toBe(
      [
        "Write.",
        "",
        "Earlier episodes",
        "",
        "This channel has already made these related episodes. Stay consistent with them and never contradict them; refer back to one where it fits naturally, but don't retell it.",
        "",
        '- "A": One two.',
      ].join("\n"),
    );
  });

  it("is copied into a new run's config only while the channel's setting is on", () => {
    const h = harness();
    h.db
      .prepare(
        `INSERT INTO episode_memories(id,channel_id,project_id,title,summary,cast_json,source,created_at,updated_at)
         VALUES ('m1',?,'p-old','Tiamat Awakens','She woke.','["Tiamat"]','generated','2026-09-01','2026-09-01')`,
      )
      .run(defaultChannelId);
    const written = draft({
      title: "Tiamat's Children",
      sources: { ...draft().sources, article: "generate" },
      articlePrompt: "Lore",
      provided: {},
    });
    const on = startRun(h.storage, written, { article: "Write about Tiamat." });
    expect(on.project.config.earlierEpisodes).toEqual([
      { title: "Tiamat Awakens", summary: "She woke." },
    ]);
    // A provided article is not written, so it needs no reminder.
    const provided = startRun(h.storage, draft({ title: "Tiamat's Children" }), {});
    expect(provided.project.config.earlierEpisodes).toBeUndefined();
    setEpisodeMemory(h.summary, defaultChannelId, { enabled: false });
    const off = startRun(h.storage, written, { article: "Write about Tiamat." });
    expect(off.project.config).not.toHaveProperty("earlierEpisodes");
  });

  it("starts on for a new channel", () => {
    const h = harness();
    const id = randomUUID();
    expect(createChannel({ db: h.db, clock, uuid: randomUUID }, { id, name: "Lore" }).ok).toBe(
      true,
    );
    expect(channelEpisodes(h.summary, id)).toEqual({
      ok: true,
      value: { enabled: true, memories: [] },
    });
  });
});

it("a memory can be deleted, only through its own channel", () => {
  const h = harness();
  h.db
    .prepare(
      `INSERT INTO episode_memories(id,channel_id,project_id,title,summary,source,created_at,updated_at)
       VALUES ('m1',?,'p1','T','S','generated','2026-09-01','2026-09-01')`,
    )
    .run(defaultChannelId);
  expect(deleteMemory(h.summary, randomUUID(), "m1")).toMatchObject({ ok: false });
  expect(deleteMemory(h.summary, defaultChannelId, "m1")).toMatchObject({ ok: true });
  expect(memoriesOfChannel(h.db, defaultChannelId)).toEqual([]);
});

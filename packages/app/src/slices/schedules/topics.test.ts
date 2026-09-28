import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import type { ScheduleTopicsEvent } from "../../kernel/events.js";
import type { LlmPort, Message } from "../../kernel/ports/llm.js";
import { providerError } from "../../kernel/ports/model.js";
import { standaloneOver } from "../../kernel/runner/standalone.fake.js";
import { standaloneLlm } from "../../kernel/runner/standalone.js";
import { defaultChannelId } from "../channels/model.js";
import { setProjectChannel } from "../channels/repo.js";
import { createChannel } from "../channels/service.js";
import { importChannelVideos } from "../channels/videos.js";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { createStandaloneMeter } from "../run-cost/meter.js";
import type { ScheduleDeps, TopicLlm } from "./model.js";
import { scheduleById } from "./repo.js";
import { createScheduleRunner } from "./scheduler.js";
import type { TopicGeneration } from "./schema.js";
import { createSchedule } from "./service.js";
import {
  approveHeldTopics,
  editHeldTopic,
  generateTopics,
  generationDue,
  generationRetryMs,
  heldTopics,
  heldValuesKey,
  knownTitles,
  moveTopic,
  parseTopics,
  rejectHeldTopic,
  replaceTopics,
  transferTopic,
} from "./topics.js";

interface Call {
  readonly provider: string;
  readonly model: string;
  readonly messages: readonly Message[];
}

function setup(options: {
  readonly generation: TopicGeneration;
  readonly items?: readonly string[];
  readonly answers: (call: Call) => Promise<string>;
  // In place of the fake: the real standalone call, for the tests that meter it.
  readonly topicLlm?: TopicLlm;
  // More keywords the template stores values for, beside {{Topic}}.
  readonly keywords?: Readonly<Record<string, string>>;
}) {
  const h = startFixture();
  const templateId = randomUUID();
  const created = createTemplate(h.deps, {
    id: templateId,
    name: "Lore",
    document: {
      ...h.document,
      form: {
        ...h.document.form,
        title: "History: {{Topic}}",
        values: { Topic: "", ...options.keywords },
        llm: { provider: "template-llm", model: "template-model" },
      },
    },
  });
  if (!created.ok) throw new Error(`template refused: ${created.reason}`);
  let now = new Date("2026-09-12T00:00:00.000Z");
  const calls: Call[] = [];
  const waiting: ScheduleTopicsEvent[] = [];
  const topicLlm: TopicLlm = async (call) => {
    calls.push({ provider: call.provider, model: call.model, messages: call.messages });
    return { text: await options.answers(call), usage: null };
  };
  const deps: ScheduleDeps = {
    ...h.deps,
    clock: { now: () => now, sleep: async () => undefined },
    template: (id: string) => templateById(h.deps.db, id),
    topicLlm: options.topicLlm ?? topicLlm,
    topicsWaiting: (event) => {
      waiting.push(event);
    },
  };
  const id = randomUUID();
  const schedule = createSchedule(deps, {
    id,
    name: "Ancient history",
    templateId,
    templateVersion: 1,
    cadence: { kind: "daily", time: "00:01" },
    timezone: "UTC",
    items: (options.items ?? []).map((title) => ({ title, values: {} })),
    topicKeyword: "Topic",
    brief: "Ancient history, documentary style. Famous rulers and places first.",
    topicGeneration: options.generation,
  });
  if (!schedule.ok) throw new Error(`schedule refused: ${schedule.reason}`);
  const project = (title: string): string => {
    const projectId = randomUUID();
    h.deps.db
      .prepare(
        "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      )
      .run(projectId, title, "16:9", "{}", now.toISOString(), now.toISOString());
    return projectId;
  };
  return {
    h,
    deps,
    id,
    calls,
    waiting,
    project,
    read: () => {
      const value = scheduleById(h.deps.db, id);
      if (value === undefined) throw new Error("schedule missing");
      return value;
    },
    at: (iso: string) => {
      now = new Date(iso);
    },
  };
}

const queue = (keepAtLeast: number): TopicGeneration => ({ mode: "queue", keepAtLeast, llm: null });
const hold = (keepAtLeast: number): TopicGeneration => ({ mode: "hold", keepAtLeast, llm: null });

it("merges only new topics, dropping near-duplicates of what was queued or made, best first", async () => {
  const s = setup({
    generation: queue(3),
    items: ["Cleopatra"],
    answers: async () =>
      JSON.stringify([
        "Cleopatra's Palace",
        "Hypatia",
        "Ramesses the Great",
        "ramesses the great!",
        "The Library of Alexandria",
        "Archimedes",
      ]),
  });
  try {
    s.project("History: Hypatia");
    const result = await generateTopics(s.deps, s.id);
    expect(result).toEqual({ ok: true, added: 2, mode: "queue" });
    expect(s.read().items.map((item) => item.title)).toEqual([
      "Cleopatra",
      "Ramesses the Great",
      "The Library of Alexandria",
    ]);
    // The template's LLM is used when the schedule names none; the prompt carries the brief
    // and every title already known.
    const [call] = s.calls;
    expect(call?.provider).toBe("template-llm");
    expect(call?.model).toBe("template-model");
    const prompt = call?.messages.map((message) => message.content).join("\n") ?? "";
    expect(prompt).toContain("Famous rulers and places first.");
    expect(prompt).toContain("- Cleopatra");
    expect(prompt).toContain("- History: Hypatia");
    expect(prompt).toContain("{{Topic}}");
    expect(prompt).toContain("Suggest 7 new topics");
    expect(s.read().topics).toMatchObject({ error: null, generatingSince: null });
  } finally {
    s.h.close();
  }
});

it("compares only with the projects of the schedule's own channel", async () => {
  const s = setup({
    generation: queue(2),
    answers: async () => JSON.stringify(["Hypatia", "Nefertiti", "Imhotep"]),
  });
  try {
    const other = randomUUID();
    createChannel(s.h.deps, { id: other, name: "Sleep" });
    s.project("History: Nefertiti");
    const elsewhere = s.project("Sleep Stories: Hypatia");
    setProjectChannel(s.h.deps.db, elsewhere, other);
    expect(knownTitles(s.deps, s.id).projects).toEqual(["History: Nefertiti"]);
    expect(await generateTopics(s.deps, s.id)).toEqual({ ok: true, added: 2, mode: "queue" });
    expect(s.read().items.map((item) => item.title)).toEqual(["Hypatia", "Imhotep"]);
    const prompt = s.calls[0]?.messages.map((message) => message.content).join("\n") ?? "";
    expect(prompt).not.toContain("Sleep Stories: Hypatia");
  } finally {
    s.h.close();
  }
});

it("reads a numbered list when the LLM does not answer in JSON", () => {
  expect(parseTopics('Sure!\n1. "Hanging Gardens"\n2) Ziggurats\n- Sphinxes\n')).toEqual([
    "Sure!",
    "Hanging Gardens",
    "Ziggurats",
    "Sphinxes",
  ]);
  expect(parseTopics('```json\n["Pyramids", {"title": "Obelisks"}]\n```')).toEqual([
    "Pyramids",
    "Obelisks",
  ]);
});

it("keeps at least N queued: the tick refills, runs keep going when the queue empties", async () => {
  let batch = 0;
  const s = setup({
    generation: queue(2),
    answers: async () => {
      batch += 1;
      return JSON.stringify([`Topic ${String(batch)}a`, `Topic ${String(batch)}b`]);
    },
  });
  try {
    const runner = createScheduleRunner(s.deps);
    // Before the first run: the empty queue is filled to two.
    s.at("2026-09-12T00:00:10.000Z");
    await runner.tick(s.deps.clock.now());
    await runner.generated();
    expect(s.read().items.map((item) => item.title)).toEqual(["Topic 1a", "Topic 1b"]);
    // Full: nothing is asked.
    await runner.tick(s.deps.clock.now());
    await runner.generated();
    expect(s.calls).toHaveLength(1);
    // The run takes the first topic and records it as used; the schedule stays active.
    s.at("2026-09-12T00:01:10.000Z");
    await runner.tick(s.deps.clock.now());
    await runner.generated();
    expect(s.read().items.map((item) => item.title)).toEqual(["Topic 1b"]);
    expect(s.read().status).toBe("active");
    expect(
      s.h.deps.db.prepare("SELECT title,state FROM schedule_topics WHERE schedule_id=?").all(s.id),
    ).toEqual([{ title: "Topic 1a", state: "used" }]);
    // The next tick tops it back up.
    await runner.tick(s.deps.clock.now());
    await runner.generated();
    expect(s.read().items.map((item) => item.title)).toEqual(["Topic 1b", "Topic 2a"]);
  } finally {
    s.h.close();
  }
});

it("skips a run with a plain reason when a generating schedule has no topic", async () => {
  const s = setup({
    generation: hold(2),
    answers: async () => JSON.stringify(["Hammurabi", "Imhotep"]),
  });
  try {
    await generateTopics(s.deps, s.id);
    const runner = createScheduleRunner(s.deps);
    s.at("2026-09-12T00:01:10.000Z");
    await runner.tick(s.deps.clock.now());
    await runner.generated();
    expect(
      s.h.deps.db.prepare("SELECT status,error FROM schedule_runs WHERE schedule_id=?").all(s.id),
    ).toEqual([
      {
        status: "skipped",
        error:
          "Skipped because no topic was approved: 2 topics are waiting for you. Approve them under Schedules → Ancient history → Topics waiting.",
      },
    ]);
    expect(s.h.events).toEqual([]);
  } finally {
    s.h.close();
  }
});

it("holds topics for approval, notifies once, and approves, edits and rejects them", async () => {
  let round = 0;
  const s = setup({
    generation: hold(3),
    answers: async () => {
      round += 1;
      return round === 1
        ? JSON.stringify(["Hammurabi", "Imhotep", "Sargon", "Nefertiti"])
        : JSON.stringify(["Imhotep", "Hammurabi", "Xerxes"]);
    },
  });
  try {
    expect(await generateTopics(s.deps, s.id)).toEqual({ ok: true, added: 3, mode: "hold" });
    expect(s.read().items).toEqual([]);
    expect(s.read().topics.held).toBe(3);
    expect(s.waiting).toEqual([
      {
        type: "schedule.topics",
        scheduleId: s.id,
        scheduleName: "Ancient history",
        added: 3,
        waiting: 3,
      },
    ]);
    // Held topics count toward "keep at least", so nothing more is asked while they wait.
    expect(generationDue(s.read(), s.deps.clock.now())).toBe(false);

    const [first, second, third] = heldTopics(s.deps, s.id);
    if (first === undefined || second === undefined || third === undefined)
      throw new Error("three held topics");
    expect([first.title, second.title, third.title]).toEqual(["Hammurabi", "Imhotep", "Sargon"]);
    expect(editHeldTopic(s.deps, s.id, third.id, { title: "Sargon, King of Akkad" }).ok).toBe(true);
    expect(rejectHeldTopic(s.deps, s.id, second.id).ok).toBe(true);
    const approved = approveHeldTopics(s.deps, s.id, [first.id], { [first.id]: "The Hammurabi" });
    expect(approved.ok && approved.value.items.map((item) => item.title)).toEqual([
      "The Hammurabi",
    ]);
    expect(rejectHeldTopic(s.deps, s.id, first.id)).toEqual({
      ok: false,
      reason: "topic-not-found",
    });
    const all = approveHeldTopics(s.deps, s.id, "all");
    expect(all.ok && all.value.items.map((item) => item.title)).toEqual([
      "The Hammurabi",
      "Sargon, King of Akkad",
    ]);
    expect(s.read().topics.held).toBe(0);

    // The rejected topic and the queued ones are never suggested again.
    expect(await generateTopics(s.deps, s.id)).toEqual({ ok: true, added: 1, mode: "hold" });
    expect(heldTopics(s.deps, s.id).map((topic) => topic.title)).toEqual(["Xerxes"]);
    const second_call = s.calls[1]?.messages.map((message) => message.content).join("\n") ?? "";
    expect(second_call).toContain("- Imhotep");
  } finally {
    s.h.close();
  }
});

it("lets Edit set a held topic's keywords, checks them, and queues them with it", async () => {
  const s = setup({
    generation: hold(2),
    keywords: { "Word Count": "8000", Tone: "calm" },
    answers: async () => JSON.stringify(["Cleopatra", "Hypatia"]),
  });
  try {
    await generateTopics(s.deps, s.id);
    const [first, second] = heldTopics(s.deps, s.id);
    if (first === undefined || second === undefined) throw new Error("two held topics");
    expect(first.values).toEqual({});
    const refused = editHeldTopic(s.deps, s.id, first.id, {
      title: "Cleopatra",
      values: { Mood: "grim" },
    });
    expect(refused).toMatchObject({ ok: false, reason: "invalid-topics" });
    expect(!refused.ok && refused.message).toContain("“Mood” is not a keyword of this template");
    const edited = editHeldTopic(s.deps, s.id, first.id, {
      title: "Cleopatra, Queen of the Nile",
      values: { "Word Count": " 12000 ", Tone: "" },
    });
    expect(edited).toMatchObject({
      ok: true,
      value: { title: "Cleopatra, Queen of the Nile", values: { "Word Count": "12000" } },
    });
    // A title-only edit keeps the keywords set before.
    editHeldTopic(s.deps, s.id, first.id, { title: "Cleopatra" });
    expect(heldTopics(s.deps, s.id)[0]?.values).toEqual({ "Word Count": "12000" });
    editHeldTopic(s.deps, s.id, second.id, { title: "Hypatia", values: { Tone: "grim" } });
    rejectHeldTopic(s.deps, s.id, second.id);
    const approved = approveHeldTopics(s.deps, s.id, "all");
    expect(approved.ok && approved.value.items).toEqual([
      { title: "Cleopatra", values: { "Word Count": "12000" } },
    ]);
    // Nothing is left behind for topics no longer held.
    expect(
      s.h.deps.db.prepare("SELECT value FROM settings WHERE key=?").get(heldValuesKey),
    ).toEqual({ value: "{}" });
  } finally {
    s.h.close();
  }
});

it("never runs two generations for one schedule at once", async () => {
  let release: (text: string) => void = () => undefined;
  const s = setup({
    generation: queue(2),
    answers: () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  });
  try {
    const first = generateTopics(s.deps, s.id);
    const second = await generateTopics(s.deps, s.id, { force: true });
    expect(second).toMatchObject({ ok: false, reason: "busy" });
    expect(s.read().topics.generatingSince).toBe("2026-09-12T00:00:00.000Z");
    // A tick while it is going starts nothing either.
    expect(generationDue(s.read(), s.deps.clock.now())).toBe(false);
    const runner = createScheduleRunner(s.deps);
    await runner.tick(s.deps.clock.now());
    await Promise.resolve();
    expect(s.calls).toHaveLength(1);
    release(JSON.stringify(["Ziggurats", "Hanging Gardens"]));
    expect(await first).toEqual({ ok: true, added: 2, mode: "queue" });
    expect(s.read().topics.generatingSince).toBeNull();
  } finally {
    s.h.close();
  }
});

it("records a failure with a plain reason and retries on a later tick, not in a loop", async () => {
  let fails = true;
  const s = setup({
    generation: queue(1),
    answers: async () => {
      if (fails) throw new Error("Codex is signed out");
      return JSON.stringify(["Ziggurats"]);
    },
  });
  try {
    const result = await generateTopics(s.deps, s.id);
    expect(result).toMatchObject({ ok: false, reason: "failed" });
    expect(s.read().topics.error).toBe(
      "Couldn't generate topics: template-llm (template-model) did not answer: Codex is signed out. Check it in Settings → Providers, or pick another LLM under Edit → Topic generation. Slopify tries again in 5 minutes, or press Generate topics now on the Schedules screen.",
    );
    const runner = createScheduleRunner(s.deps);
    s.at("2026-09-12T00:00:30.000Z");
    await runner.tick(s.deps.clock.now());
    await runner.generated();
    expect(s.calls).toHaveLength(1);
    fails = false;
    s.at(new Date(Date.parse("2026-09-12T00:00:00.000Z") + generationRetryMs).toISOString());
    await runner.tick(s.deps.clock.now());
    await runner.generated();
    expect(s.calls).toHaveLength(2);
    expect(s.read().items.map((item) => item.title)).toEqual(["Ziggurats"]);
    expect(s.read().topics).toMatchObject({ error: null, failedAt: null });
  } finally {
    s.h.close();
  }
});

it("asks through the attempt wrapper, retrying a dropped call, and meters it on the schedule", async () => {
  let asked = 0;
  const port: LlmPort = {
    id: "template-llm",
    capabilities: { streams: true, reportsUsage: true, webSearch: false },
    models: () => Promise.resolve([]),
    complete: async function* () {
      asked += 1;
      if (asked === 1) throw providerError({ kind: "dropped", message: "Connection reset." });
      yield { type: "delta", text: JSON.stringify(["Ziggurats"]) };
      yield {
        type: "done",
        usage: { inputTokens: 400, outputTokens: 20 },
        finishReason: "stop",
      };
    },
  };

  const s = setup({
    generation: queue(1),
    answers: async () => "[]",
    topicLlm: (call) =>
      standaloneLlm(
        standaloneOver(
          { llm: port },
          {
            clock: fixedClock("2026-09-12T00:00:00.000Z"),
            meter: createStandaloneMeter({
              db: s.h.deps.db,
              ids: { next: randomUUID },
              clock: fixedClock("2026-09-12T00:00:00.000Z"),
              catalogue: () => s.h.deps.catalogue.read(),
            }),
          },
        ),
        call,
      ),
  });
  const db = s.h.deps.db;
  try {
    expect(await generateTopics(s.deps, s.id)).toEqual({ ok: true, added: 1, mode: "queue" });
    expect(asked).toBe(2);
    expect(
      db
        .prepare(
          "SELECT owner_kind, owner_id, channel_id, purpose, kind, provider, model, tokens_in, tokens_out FROM standalone_usage",
        )
        .all(),
    ).toEqual([
      {
        owner_kind: "schedule",
        owner_id: s.id,
        channel_id: defaultChannelId,
        purpose: "topics",
        kind: "llm",
        provider: "template-llm",
        model: "template-model",
        tokens_in: 400,
        tokens_out: 20,
      },
    ]);
    expect(db.prepare("SELECT count(*) AS n FROM provider_usage").get()).toEqual({ n: 0 });
  } finally {
    s.h.close();
  }
});

it("counts an answer of only duplicates as a failure", async () => {
  const s = setup({
    generation: queue(2),
    items: ["Obelisks"],
    answers: async () => JSON.stringify(["obelisk", "The Obelisks"]),
  });
  try {
    expect(await generateTopics(s.deps, s.id)).toMatchObject({ ok: false, reason: "failed" });
    expect(s.read().topics.error).toContain("already made, queued or turned down");
    expect(s.read().items).toHaveLength(1);
  } finally {
    s.h.close();
  }
});

it("saves an edited queue in place, keeping the next run, and refuses a stale or unfit one", () => {
  const s = setup({
    generation: { mode: "off", keepAtLeast: 10, llm: null },
    items: ["A", "B"],
    answers: async () => "[]",
  });
  try {
    const base = s.read();
    const saved = replaceTopics(s.deps, s.id, {
      baseVersion: base.version,
      items: [
        { title: "B", values: {} },
        { title: "  Hypatia ", values: {} },
      ],
    });
    expect(saved.ok && saved.value.items.map((item) => item.title)).toEqual(["B", "Hypatia"]);
    expect(saved.ok && saved.value.version).toBe(base.version + 1);
    // Only the queue changes: the next run and every other setting stay as they were.
    expect(saved.ok && saved.value.nextRunAt).toBe(base.nextRunAt);
    expect(saved.ok && saved.value.name).toBe(base.name);
    expect(replaceTopics(s.deps, s.id, { baseVersion: base.version, items: [] })).toEqual({
      ok: false,
      reason: "conflict",
    });
    const refused = replaceTopics(s.deps, s.id, {
      baseVersion: base.version + 1,
      items: [{ title: "Cleopatra", values: { Mood: "grim" } }],
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toBe("invalid-topics");
    expect(refused.message).toContain("“Mood” is not a keyword of this template");
    expect(s.read().items.map((item) => item.title)).toEqual(["B", "Hypatia"]);
  } finally {
    s.h.close();
  }
});

it("reorders a queue and moves a topic to another schedule", () => {
  const s = setup({
    generation: { mode: "off", keepAtLeast: 10, llm: null },
    items: ["A", "B", "C"],
    answers: async () => "[]",
  });
  try {
    const base = s.read();
    const moved = moveTopic(s.deps, s.id, { baseVersion: base.version, from: 2, to: 0 });
    expect(moved.ok && moved.value.items.map((item) => item.title)).toEqual(["C", "A", "B"]);
    // A stale version refuses rather than moving the wrong topic.
    expect(moveTopic(s.deps, s.id, { baseVersion: base.version, from: 0, to: 1 })).toEqual({
      ok: false,
      reason: "conflict",
    });
    const otherId = randomUUID();
    const other = createSchedule(s.deps, {
      id: otherId,
      name: "Other",
      templateId: base.templateId,
      templateVersion: 1,
      cadence: { kind: "daily", time: "09:00" },
      timezone: "UTC",
      items: [{ title: "Z", values: {} }],
    });
    expect(other.ok).toBe(true);
    const current = s.read();
    const transferred = transferTopic(s.deps, s.id, {
      baseVersion: current.version,
      index: 1,
      targetId: otherId,
      position: 0,
    });
    expect(transferred.ok).toBe(true);
    if (!transferred.ok) return;
    expect(transferred.value.source.items.map((item) => item.title)).toEqual(["C", "B"]);
    expect(transferred.value.target.items.map((item) => item.title)).toEqual(["A", "Z"]);
  } finally {
    s.h.close();
  }
});

it("skips the titles of the channel's existing videos, and lists them in the prompt", async () => {
  const s = setup({
    generation: queue(3),
    answers: async () => JSON.stringify(["Hypatia", "Ramesses the Great", "Archimedes"]),
  });
  try {
    // The template names no channel, so the schedule is the default channel's.
    const imported = importChannelVideos(
      { db: s.h.deps.db, clock: s.deps.clock, uuid: randomUUID },
      defaultChannelId,
      { format: "lines", text: "Who was Hypatia? The Last Scholar Explained\n" },
    );
    expect(imported).toEqual({ ok: true, value: { added: 1, skipped: 0 } });
    expect(await generateTopics(s.deps, s.id)).toEqual({ ok: true, added: 2, mode: "queue" });
    expect(s.read().items.map((item) => item.title)).toEqual(["Ramesses the Great", "Archimedes"]);
    const prompt = s.calls[0]?.messages.map((message) => message.content).join("\n") ?? "";
    expect(prompt).toContain("- Who was Hypatia? The Last Scholar Explained");
  } finally {
    s.h.close();
  }
});

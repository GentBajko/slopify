import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { ScheduleTopicsEvent } from "../../kernel/events.js";
import type { Message } from "../../kernel/ports/llm.js";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
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
  moveTopic,
  parseTopics,
  rejectHeldTopic,
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
        title: "D&D Lore: {{Topic}}",
        values: { Topic: "" },
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
    return options.answers(call);
  };
  const deps: ScheduleDeps = {
    ...h.deps,
    clock: { now: () => now, sleep: async () => undefined },
    template: (id, version) => templateById(h.deps.db, id, version),
    topicLlm,
    topicsWaiting: (event) => {
      waiting.push(event);
    },
  };
  const id = randomUUID();
  const schedule = createSchedule(deps, {
    id,
    name: "D&D lore",
    templateId,
    templateVersion: 1,
    cadence: { kind: "daily", time: "00:01" },
    timezone: "UTC",
    items: (options.items ?? []).map((title) => ({ title, values: {} })),
    topicKeyword: "Topic",
    brief: "D&D lore, documentary style. Famous villains and places first.",
    topicGeneration: options.generation,
  });
  if (!schedule.ok) throw new Error(`schedule refused: ${schedule.reason}`);
  const project = (title: string): void => {
    h.deps.db
      .prepare(
        "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      )
      .run(randomUUID(), title, "16:9", "{}", now.toISOString(), now.toISOString());
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
    items: ["Tiamat"],
    answers: async () =>
      JSON.stringify([
        "Tiamat's Lair",
        "Vecna",
        "Strahd von Zarovich",
        "strahd von zarovich!",
        "The Lady of Pain",
        "Acererak",
      ]),
  });
  try {
    s.project("D&D Lore: Vecna");
    const result = await generateTopics(s.deps, s.id);
    expect(result).toEqual({ ok: true, added: 2, mode: "queue" });
    expect(s.read().items.map((item) => item.title)).toEqual([
      "Tiamat",
      "Strahd von Zarovich",
      "The Lady of Pain",
    ]);
    // The template's LLM is used when the schedule names none; the prompt carries the brief
    // and every title already known.
    const [call] = s.calls;
    expect(call?.provider).toBe("template-llm");
    expect(call?.model).toBe("template-model");
    const prompt = call?.messages.map((message) => message.content).join("\n") ?? "";
    expect(prompt).toContain("Famous villains and places first.");
    expect(prompt).toContain("- Tiamat");
    expect(prompt).toContain("- D&D Lore: Vecna");
    expect(prompt).toContain("{{Topic}}");
    expect(prompt).toContain("Suggest 7 new topics");
    expect(s.read().topics).toMatchObject({ error: null, generatingSince: null });
  } finally {
    s.h.close();
  }
});

it("reads a numbered list when the LLM does not answer in JSON", () => {
  expect(parseTopics('Sure!\n1. "Mind Flayers"\n2) Beholders\n- Liches\n')).toEqual([
    "Sure!",
    "Mind Flayers",
    "Beholders",
    "Liches",
  ]);
  expect(parseTopics('```json\n["Owlbears", {"title": "Mimics"}]\n```')).toEqual([
    "Owlbears",
    "Mimics",
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
    answers: async () => JSON.stringify(["Tarrasque", "Orcus"]),
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
          "Skipped because no topic was approved: 2 topics are waiting for you. Approve them under Schedules → D&D lore → Topics waiting.",
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
        ? JSON.stringify(["Tarrasque", "Orcus", "Demogorgon", "Lolth"])
        : JSON.stringify(["Orcus", "Tarrasque", "Asmodeus"]);
    },
  });
  try {
    expect(await generateTopics(s.deps, s.id)).toEqual({ ok: true, added: 3, mode: "hold" });
    expect(s.read().items).toEqual([]);
    expect(s.read().topics.held).toBe(3);
    expect(s.waiting).toEqual([
      { type: "schedule.topics", scheduleId: s.id, scheduleName: "D&D lore", added: 3, waiting: 3 },
    ]);
    // Held topics count toward "keep at least", so nothing more is asked while they wait.
    expect(generationDue(s.read(), s.deps.clock.now())).toBe(false);

    const [first, second, third] = heldTopics(s.deps, s.id);
    if (first === undefined || second === undefined || third === undefined)
      throw new Error("three held topics");
    expect([first.title, second.title, third.title]).toEqual(["Tarrasque", "Orcus", "Demogorgon"]);
    expect(editHeldTopic(s.deps, s.id, third.id, "Demogorgon, Prince of Demons").ok).toBe(true);
    expect(rejectHeldTopic(s.deps, s.id, second.id).ok).toBe(true);
    const approved = approveHeldTopics(s.deps, s.id, [first.id], { [first.id]: "The Tarrasque" });
    expect(approved.ok && approved.value.items.map((item) => item.title)).toEqual([
      "The Tarrasque",
    ]);
    expect(rejectHeldTopic(s.deps, s.id, first.id)).toEqual({
      ok: false,
      reason: "topic-not-found",
    });
    const all = approveHeldTopics(s.deps, s.id, "all");
    expect(all.ok && all.value.items.map((item) => item.title)).toEqual([
      "The Tarrasque",
      "Demogorgon, Prince of Demons",
    ]);
    expect(s.read().topics.held).toBe(0);

    // The rejected topic and the queued ones are never suggested again.
    expect(await generateTopics(s.deps, s.id)).toEqual({ ok: true, added: 1, mode: "hold" });
    expect(heldTopics(s.deps, s.id).map((topic) => topic.title)).toEqual(["Asmodeus"]);
    const second_call = s.calls[1]?.messages.map((message) => message.content).join("\n") ?? "";
    expect(second_call).toContain("- Orcus");
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
    release(JSON.stringify(["Beholders", "Mind Flayers"]));
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
      return JSON.stringify(["Beholders"]);
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
    expect(s.read().items.map((item) => item.title)).toEqual(["Beholders"]);
    expect(s.read().topics).toMatchObject({ error: null, failedAt: null });
  } finally {
    s.h.close();
  }
});

it("counts an answer of only duplicates as a failure", async () => {
  const s = setup({
    generation: queue(2),
    items: ["Mimics"],
    answers: async () => JSON.stringify(["mimic", "The Mimics"]),
  });
  try {
    expect(await generateTopics(s.deps, s.id)).toMatchObject({ ok: false, reason: "failed" });
    expect(s.read().topics.error).toContain("already made, queued or turned down");
    expect(s.read().items).toHaveLength(1);
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

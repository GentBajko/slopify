import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { rejectHeldTopics, restoreRejectedTopics } from "./held-bulk.js";
import type { ScheduleDeps } from "./model.js";
import { createSchedule } from "./service.js";
import { editHeldTopic, heldTopics } from "./topics.js";

function setup() {
  const h = startFixture();
  const templateId = randomUUID();
  const created = createTemplate(h.deps, {
    id: templateId,
    name: "Lore",
    document: {
      ...h.document,
      form: { ...h.document.form, title: "{{Topic}}", values: { Topic: "", Tone: "calm" } },
    },
  });
  if (!created.ok) throw new Error(`template refused: ${created.reason}`);
  const deps: ScheduleDeps = {
    ...h.deps,
    clock: { now: () => new Date("2026-09-12T00:00:00.000Z"), sleep: async () => undefined },
    template: (id: string) => templateById(h.deps.db, id),
  };
  const id = randomUUID();
  const schedule = createSchedule(deps, {
    id,
    name: "Ancient history",
    templateId,
    templateVersion: 1,
    cadence: { kind: "daily", time: "00:01" },
    timezone: "UTC",
    topicKeyword: "Topic",
    topicGeneration: { mode: "hold", keepAtLeast: 3, llm: null },
  });
  if (!schedule.ok) throw new Error(`schedule refused: ${schedule.reason}`);
  const insert = h.deps.db.prepare(
    `INSERT INTO schedule_topics (id,schedule_id,title,state,rank,created_at)
     VALUES (?,?,?,'held',?,?)`,
  );
  const ids = ["Hammurabi", "Imhotep", "Sargon"].map((title, rank) => {
    const topicId = randomUUID();
    insert.run(topicId, id, title, rank, "2026-09-12T00:00:00.000Z");
    return topicId;
  });
  return { deps, id, ids, titles: () => heldTopics(deps, id).map((topic) => topic.title) };
}

it("turns down several held topics at once, and puts them back with their keywords", () => {
  const s = setup();
  const [first, second, third] = s.ids;
  if (first === undefined || second === undefined || third === undefined) throw new Error("ids");
  expect(
    editHeldTopic(s.deps, s.id, second, { title: "Imhotep", values: { Tone: "grim" } }).ok,
  ).toBe(true);
  const rejected = rejectHeldTopics(s.deps, s.id, [first, second]);
  expect(rejected.ok && rejected.value.topics.held).toBe(1);
  expect(s.titles()).toEqual(["Sargon"]);

  const restored = restoreRejectedTopics(s.deps, s.id, [
    { id: first },
    { id: second, values: { Tone: "grim" } },
  ]);
  expect(restored.ok && restored.value.topics.held).toBe(3);
  expect(heldTopics(s.deps, s.id).map((topic) => [topic.title, topic.values])).toEqual([
    ["Hammurabi", {}],
    ["Imhotep", { Tone: "grim" }],
    ["Sargon", {}],
  ]);
});

it("changes nothing when one of the topics is no longer waiting", () => {
  const s = setup();
  const [first, second] = s.ids;
  if (first === undefined || second === undefined) throw new Error("ids");
  expect(rejectHeldTopics(s.deps, s.id, [first, "gone"])).toEqual({
    ok: false,
    reason: "topic-not-found",
  });
  expect(s.titles()).toEqual(["Hammurabi", "Imhotep", "Sargon"]);
  // Only a turned-down topic can be put back.
  expect(restoreRejectedTopics(s.deps, s.id, [{ id: second }])).toEqual({
    ok: false,
    reason: "topic-not-found",
  });
  expect(rejectHeldTopics(s.deps, s.id, [])).toEqual({ ok: false, reason: "invalid-input" });
});

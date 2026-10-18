import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import type { InterestResult, TopicInterest } from "../../kernel/ports/interest.js";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import type { ScheduleDeps } from "./model.js";
import { scheduleById } from "./repo.js";
import { rescoreTopics } from "./rescore.js";
import type { TopicGeneration, TopicScoring } from "./schema.js";
import { createSchedule } from "./service.js";
import { scoresOf } from "./topic-scores.js";
import { generateTopics, heldTopics, moveTopic } from "./topics.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const one of open.splice(0)) one.close();
});

function setup(options: {
  readonly scoring?: TopicScoring;
  readonly mode?: TopicGeneration["mode"];
  readonly answer: string[];
  readonly interest?: TopicInterest;
}) {
  const h = startFixture();
  open.push(h);
  const templateId = randomUUID();
  expect(
    createTemplate(h.deps, {
      id: templateId,
      name: "Lighthouses",
      document: {
        ...h.document,
        form: {
          ...h.document.form,
          title: "History: {{Topic}}",
          values: { Topic: "" },
          llm: { provider: "template-llm", model: "m" },
        },
      },
    }).ok,
  ).toBe(true);
  h.deps.db
    .prepare(
      "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    )
    .run(randomUUID(), "Pyramids of Giza Secrets", "16:9", "{}", "a", "a");
  const asked: string[] = [];
  const given = options.interest;
  const deps: ScheduleDeps = {
    ...h.deps,
    template: (id: string) => templateById(h.deps.db, id),
    topicLlm: async () => ({ text: JSON.stringify(options.answer), usage: null }),
    ...(given === undefined
      ? {}
      : {
          interest: async (topic, language, signal) => {
            asked.push(`${topic}|${language}`);
            return given(topic, language, signal);
          },
        }),
  };
  const id = randomUUID();
  const created = createSchedule(deps, {
    id,
    name: "Ancient history",
    templateId,
    templateVersion: 1,
    cadence: { kind: "daily", time: "00:01" },
    timezone: "UTC",
    items: [{ title: "Sargon", values: {} }],
    topicKeyword: "Topic",
    topicGeneration: { mode: options.mode ?? "queue", keepAtLeast: 3, llm: null },
    ...(options.scoring === undefined ? {} : { topicScoring: options.scoring }),
  });
  if (!created.ok) throw new Error(created.reason);
  const queue = () => scheduleById(deps.db, id)?.items.map((item) => item.title);
  return { deps, id, asked, queue };
}

const llmOrder = ["Pyramids of Egypt", "Hypatia"];

it("adds topics in the LLM's order and keeps no scores while scoring is off", async () => {
  const s = setup({ answer: llmOrder, interest: async () => ({ ok: false, reason: "offline" }) });
  expect(await generateTopics(s.deps, s.id)).toMatchObject({ ok: true, added: 2 });
  expect(s.queue()).toEqual(["Sargon", "Pyramids of Egypt", "Hypatia"]);
  expect(scoresOf(s.deps.db, s.id).size).toBe(0);
  expect(s.asked).toEqual([]);
});

it("ranks by what the library covers without asking anything outside", async () => {
  const s = setup({
    scoring: "library",
    answer: llmOrder,
    interest: async () => ({ ok: false, reason: "offline" }),
  });
  expect(await generateTopics(s.deps, s.id)).toMatchObject({ ok: true, added: 2 });
  // The person's own topic stays first; the newer topic leads the generated ones.
  expect(s.queue()).toEqual(["Sargon", "Hypatia", "Pyramids of Egypt"]);
  expect(s.asked).toEqual([]);
  const scores = scoresOf(s.deps.db, s.id);
  expect([...scores.values()].map((one) => [one.title, one.score])).toEqual([
    ["Hypatia", 100],
    ["Pyramids of Egypt", 75],
  ]);
  expect([...scores.values()][1]?.reasons).toEqual([
    "Library: new; nearest “Pyramids of Giza Secrets” (25% overlap)",
  ]);
});

it("still adds topics when search can't be reached, ranked by novelty and saying why", async () => {
  const s = setup({
    scoring: "search",
    answer: llmOrder,
    interest: async () => ({ ok: false, reason: "offline" }),
  });
  expect(await generateTopics(s.deps, s.id)).toMatchObject({ ok: true, added: 2 });
  expect(s.queue()).toEqual(["Sargon", "Hypatia", "Pyramids of Egypt"]);
  expect(s.asked.sort()).toEqual(["Hypatia|en", "Pyramids of Egypt|en"]);
  expect([...scoresOf(s.deps.db, s.id).values()][0]?.reasons[0]).toBe(
    "Search interest unknown: no connection to Google, DuckDuckGo or Wikipedia",
  );
});

it("puts the topic people search for first, and scores with no interest service at all", async () => {
  const read = (topic: string): InterestResult =>
    topic === "Pyramids of Egypt"
      ? {
          ok: true,
          suggestions: Array.from({ length: 10 }, () => "pyramids of egypt facts"),
          wikiViews: 2_000_000,
        }
      : { ok: true, suggestions: [], wikiViews: null };
  const s = setup({ scoring: "search", answer: llmOrder, interest: async (topic) => read(topic) });
  await generateTopics(s.deps, s.id);
  expect(s.queue()).toEqual(["Sargon", "Pyramids of Egypt", "Hypatia"]);
  const none = setup({ scoring: "search", answer: llmOrder });
  expect(await generateTopics(none.deps, none.id)).toMatchObject({ ok: true, added: 2 });
});

it("lists held topics by score, and a moved topic keeps its place when more are found", async () => {
  const held = setup({ scoring: "library", mode: "hold", answer: llmOrder });
  await generateTopics(held.deps, held.id);
  expect(heldTopics(held.deps, held.id).map((one) => one.title)).toEqual([
    "Hypatia",
    "Pyramids of Egypt",
  ]);

  const s = setup({ scoring: "library", answer: llmOrder });
  await generateTopics(s.deps, s.id);
  const version = scheduleById(s.deps.db, s.id)?.version ?? 0;
  // The person moves the weaker topic to the front.
  expect(moveTopic(s.deps, s.id, { baseVersion: version, from: 2, to: 0 }).ok).toBe(true);
  expect(s.queue()).toEqual(["Pyramids of Egypt", "Sargon", "Hypatia"]);
  expect(
    [...scoresOf(s.deps.db, s.id).values()].find((one) => one.title === "Pyramids of Egypt")
      ?.pinned,
  ).toBe(true);
});

it("rescores every topic, keeping the person's own where they stand", async () => {
  let wiki = 0;
  const s = setup({
    scoring: "search",
    answer: llmOrder,
    interest: async () => ({ ok: true, suggestions: [], wikiViews: wiki }),
  });
  await generateTopics(s.deps, s.id);
  expect(s.queue()).toEqual(["Sargon", "Hypatia", "Pyramids of Egypt"]);
  wiki = 9_000_000;
  const before = scheduleById(s.deps.db, s.id)?.version ?? 0;
  const rescored = await rescoreTopics(s.deps, s.id);
  expect(rescored.ok && rescored.value.version).toBe(before + 1);
  expect(s.queue()).toEqual(["Sargon", "Hypatia", "Pyramids of Egypt"]);
  const scores = scoresOf(s.deps.db, s.id);
  expect([...scores.values()].map((one) => [one.title, one.pinned])).toEqual([
    ["Hypatia", false],
    ["Pyramids of Egypt", false],
    ["Sargon", true],
  ]);
  expect([...scores.values()][0]?.reasons).toContain("Wikipedia: 9M views last month");
});

it("refuses to rescore while ranking is off, and a schedule that is gone", async () => {
  const s = setup({ answer: llmOrder });
  expect(await rescoreTopics(s.deps, s.id)).toMatchObject({ ok: false, reason: "scoring-off" });
  expect(await rescoreTopics(s.deps, randomUUID())).toEqual({ ok: false, reason: "not-found" });
});

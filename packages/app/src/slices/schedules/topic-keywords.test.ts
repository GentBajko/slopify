import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { calendarRange } from "./agenda.js";
import type { ScheduleDeps } from "./model.js";
import { calendarSchema, type TopicGeneration } from "./schema.js";
import { createSchedule, updateSchedule } from "./service.js";

// Topics may set any of the template's keywords, not only the one each topic fills; the
// server refuses the rest by name, and the calendar shows each run's project title.
function fixture() {
  const h = startFixture();
  const templateId = randomUUID();
  const document = {
    ...h.document,
    form: {
      ...h.document.form,
      title: "History: {{Topic}} ({{Min. Word Count}} words)",
      values: { Topic: "", "Min. Word Count": "1000" },
    },
  };
  expect(createTemplate(h.deps, { id: templateId, name: "Lore", document }).ok).toBe(true);
  const deps: ScheduleDeps = {
    ...h.deps,
    template: (id, version) => templateById(h.deps.db, id, version),
  };
  const input = (
    items: readonly { title: string; values: Record<string, string> }[],
    topicGeneration?: TopicGeneration,
  ) => ({
    id: randomUUID(),
    name: "Nightly lore",
    templateId,
    templateVersion: 1,
    cadence: { kind: "daily" as const, time: "09:00" },
    timezone: "UTC",
    items,
    topicKeyword: "Topic",
    values: { "Min. Word Count": "15000" },
    ...(topicGeneration === undefined ? {} : { topicGeneration }),
  });
  return { h, deps, input };
}

it("saves topics that set other keywords, and refuses unknown ones naming the topic and key", async () => {
  const f = fixture();
  try {
    const saved = createSchedule(
      f.deps,
      f.input([{ title: "Cleopatra", values: { "Min. Word Count": "12000" } }]),
    );
    expect(saved.ok).toBe(true);
    const refused = createSchedule(
      f.deps,
      f.input([
        { title: "Cleopatra", values: {} },
        { title: "Hypatia", values: { Colour: "red" } },
      ]),
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toBe("invalid-topics");
    expect(refused.message).toContain(
      "Topic 2 (Hypatia): “Colour” is not a keyword of this template (its keywords are “Topic”, “Min. Word Count”).",
    );
    const long = createSchedule(
      f.deps,
      f.input([{ title: "Cleopatra", values: { "Min. Word Count": "9".repeat(2001) } }]),
    );
    expect(!long.ok && long.message).toContain(
      "Topic 1 (Cleopatra): “Min. Word Count” is 2001 characters; a topic's value can be at most 2000.",
    );
    const badKeyword = createSchedule(f.deps, { ...f.input([]), topicKeyword: "Subject" });
    expect(!badKeyword.ok && badKeyword.message).toContain(
      "The topic keyword “Subject” is not in this template",
    );
  } finally {
    f.h.close();
  }
});

it("keeps saving a queue whose unchanged topics predate the check", () => {
  const f = fixture();
  try {
    const created = createSchedule(f.deps, f.input([{ title: "Arda", values: {} }]));
    if (!created.ok) throw new Error(created.reason);
    // A topic saved before the check, with a key the template no longer has.
    const legacy = { title: "Old", values: { "topic,name": "Old" } };
    f.h.deps.db
      .prepare("UPDATE schedules SET items_json=? WHERE id=?")
      .run(JSON.stringify([legacy]), created.value.id);
    const updated = updateSchedule(f.deps, {
      ...f.input([legacy, { title: "New", values: {} }]),
      id: created.value.id,
      name: "Renamed",
      baseVersion: created.value.version,
      mutationId: randomUUID(),
    });
    expect(updated.ok && updated.value.name).toBe("Renamed");
  } finally {
    f.h.close();
  }
});

it("gives each calendar run the project title it will get, or null when it isn't known yet", () => {
  const f = fixture();
  try {
    const created = createSchedule(
      f.deps,
      f.input(
        [
          { title: "Cleopatra", values: { "Min. Word Count": "12000" } },
          { title: "Hypatia", values: {} },
        ],
        { mode: "queue", keepAtLeast: 5, llm: null },
      ),
    );
    if (!created.ok) throw new Error(created.reason);
    const result = calendarRange(
      f.deps,
      new Date("2026-09-11T00:00:00.000Z"),
      new Date("2026-09-15T00:00:00.000Z"),
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.runs.map((run) => [run.topic, run.renderedTitle])).toEqual([
      ["Cleopatra", "History: Cleopatra (12000 words)"],
      ["Hypatia", "History: Hypatia (15000 words)"],
      // A topic still to be generated has no title yet.
      [null, null],
    ]);
    expect(calendarSchema.parse(result.value).runs[0]?.renderedTitle).toBe(
      "History: Cleopatra (12000 words)",
    );
  } finally {
    f.h.close();
  }
});

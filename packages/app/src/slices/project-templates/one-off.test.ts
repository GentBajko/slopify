import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { templateDocument, templateValues, topicKeywords } from "./one-off.js";
import { createTemplate, readTemplate } from "./service.js";

it("reads the topic keywords from the project title", () => {
  expect(topicKeywords("History: {{Topic}} in {{ Era }}")).toEqual(["Topic", "Era"]);
  expect(topicKeywords("A plain title")).toEqual([]);
});

it("empties the topic keywords and keeps the settings", () => {
  expect({
    ...templateValues("History: {{Topic}}", { Topic: "Cleopatra", minWords: "1500" }),
  }).toEqual({ Topic: "", minWords: "1500" });
  expect({ ...templateValues("Fixed title", { Topic: "Cleopatra" }) }).toEqual({
    Topic: "Cleopatra",
  });
});

it("drops the extra videos queued from the same setup", () => {
  const h = draftFixture();
  try {
    const document = {
      ...h.document,
      form: { ...h.document.form, title: "Lore: {{Topic}}", values: { Topic: "Cleopatra" } },
      variants: [{ id: randomUUID(), title: "Lore: {{Topic}}", values: { Topic: "Nefertiti" } }],
    };
    expect(templateDocument(document).variants).toEqual([]);
  } finally {
    h.close();
  }
});

it("never stores the topic typed for one video in a saved template", () => {
  const h = draftFixture();
  try {
    const id = randomUUID();
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        title: "History: {{Topic}}",
        values: { Topic: "Cleopatra", minWords: "1500" },
      },
    };
    expect(createTemplate(h.deps, { id, name: "Lore", document }).ok).toBe(true);
    const saved = readTemplate(h.deps, id);
    if (!saved.ok) throw new Error("Template was not saved");
    expect({ ...saved.value.document.form.values }).toEqual({ Topic: "", minWords: "1500" });
    expect(saved.value.document.form.title).toBe("History: {{Topic}}");
  } finally {
    h.close();
  }
});

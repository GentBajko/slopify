import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { templateDocument, templateValues, topicKeywords } from "./one-off.js";
import { createTemplate, readTemplate } from "./service.js";

it("reads the topic keywords from the project title", () => {
  expect(topicKeywords("D&D Lore: {{Topic}} in {{ Era }}")).toEqual(["Topic", "Era"]);
  expect(topicKeywords("A plain title")).toEqual([]);
});

it("empties the topic keywords and keeps the settings", () => {
  expect({
    ...templateValues("D&D Lore: {{Topic}}", { Topic: "Tiamat", minWords: "1500" }),
  }).toEqual({ Topic: "", minWords: "1500" });
  expect({ ...templateValues("Fixed title", { Topic: "Tiamat" }) }).toEqual({ Topic: "Tiamat" });
});

it("drops the extra videos queued from the same setup", () => {
  const h = draftFixture();
  try {
    const document = {
      ...h.document,
      form: { ...h.document.form, title: "Lore: {{Topic}}", values: { Topic: "Tiamat" } },
      variants: [{ id: randomUUID(), title: "Lore: {{Topic}}", values: { Topic: "Lolth" } }],
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
        title: "D&D Lore: {{Topic}}",
        values: { Topic: "Tiamat", minWords: "1500" },
      },
    };
    expect(createTemplate(h.deps, { id, name: "Lore", document }).ok).toBe(true);
    const saved = readTemplate(h.deps, id);
    if (!saved.ok) throw new Error("Template was not saved");
    expect({ ...saved.value.document.form.values }).toEqual({ Topic: "", minWords: "1500" });
    expect(saved.value.document.form.title).toBe("D&D Lore: {{Topic}}");
  } finally {
    h.close();
  }
});

import { expect, it } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { rowOrigin } from "./row-origin";

it("says which rows are still the template's and which this project changed", () => {
  const template = {
    form: { ...freshDraftDocument.form, title: "Lore: {{topic}}", articlePrompt: "Dossier" },
    channelId: "c-1",
  };
  // The topic typed for this one video is not a change to the setup.
  const draft = {
    form: { ...template.form, values: { topic: "Cleopatra" } },
    channelId: "c-1",
  };
  expect(rowOrigin("title", draft, template)).toBe("template");
  expect(rowOrigin("article", draft, template)).toBe("template");
  const changed = {
    ...draft,
    form: { ...draft.form, audio: { ...draft.form.audio, voice: "another" } },
  };
  expect(rowOrigin("narration", changed, template)).toBe("changed");
  expect(rowOrigin("article", changed, template)).toBe("template");
  expect(rowOrigin("channel", { ...draft, channelId: "c-2" }, template)).toBe("changed");
});

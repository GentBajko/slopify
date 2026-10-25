import { expect, it } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { rowOrigin } from "./row-origin";

it("says which rows are still the template's and which this project changed", () => {
  const template = {
    form: {
      ...freshDraftDocument.form,
      title: "Lore: {{topic}}",
      articlePrompt: "Dossier",
      audio: { ...freshDraftDocument.form.audio, provider: "openai-tts", model: "m", voice: "a" },
    },
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

it("counts a service the template left empty, and Create filled, as the template's", () => {
  const template = {
    form: { ...freshDraftDocument.form, articlePrompt: "Dossier" },
    channelId: "c-1",
  };
  const filled = {
    form: {
      ...template.form,
      llm: { provider: "claude-code", model: "sonnet" },
      images: { provider: "fal", model: "flux" },
    },
    channelId: "c-1",
  };
  expect(rowOrigin("article", filled, template)).toBe("template");
  expect(rowOrigin("images", filled, template)).toBe("template");
  // The voice's other settings still count as a change made here.
  const glossaryOff = {
    ...filled,
    form: { ...filled.form, audio: { ...filled.form.audio, usePronunciationGlossary: false } },
  };
  expect(rowOrigin("narration", glossaryOff, template)).toBe("changed");
  // A service the template picked is the template's only while it stays picked.
  const named = {
    ...template,
    form: { ...template.form, images: { provider: "fal", model: "a" } },
  };
  expect(rowOrigin("images", filled, named)).toBe("changed");
  // Unless that service can't be used here, and Create put one that can in its place.
  expect(rowOrigin("images", filled, named, (service) => service === "fal")).toBe("template");
});

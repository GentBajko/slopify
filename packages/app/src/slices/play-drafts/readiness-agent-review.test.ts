import { expect, it } from "vitest";
import type { RunDraft } from "../admission/model.js";
import { choices } from "./readiness.js";

const draft: RunDraft = {
  title: "Lighthouse",
  format: "16:9",
  sources: {
    research: "off",
    article: "generate",
    audio: "off",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
  llm: { provider: "codex", model: "gpt" },
  articlePrompt: "Story",
  imagePrompts: [],
  values: {},
  provided: {},
  silenceGapSeconds: 0,
  imageSeconds: 15,
  zoomPercent: 22.5,
  motionStyle: "zoom",
  edgeSilenceSeconds: 0,
};

it("checks a model reviewer like the text model, and no provider for the external agent", () => {
  const model = choices([
    {
      draft: {
        ...draft,
        reviews: { provider: "claude-code", model: "opus", stages: { article: { mode: "flag" } } },
      },
      rendered: {},
      templates: {},
    },
  ]);
  expect(model.map((row) => row.field)).toContain("reviews");
  const agent = choices([
    {
      draft: {
        ...draft,
        reviews: {
          provider: "",
          model: "",
          reviewer: "agent",
          stages: { article: { mode: "flag" } },
        },
      },
      rendered: {},
      templates: {},
    },
  ]);
  expect(agent.map((row) => row.field)).not.toContain("reviews");
});

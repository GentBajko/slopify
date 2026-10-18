import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { startRun } from "../admission/start.js";
import { startFixture } from "../play-drafts/draft.fake.js";
import { currentRevisionId } from "../revisions/repo.js";
import { defaultChoices } from "../social/defaults.js";
import { createTemplateFromProject } from "./from-project.js";

// A template made from a project posts where the project did, with its post prompt.
it("keeps the project's posting settings and post prompt in a template made from it", () => {
  const h = startFixture();
  try {
    const social = {
      x: { ...defaultChoices.x, text: "prompt" as const, prompt: "Teaser" },
      bluesky: defaultChoices.bluesky,
    };
    const project = startRun(
      h.deps,
      {
        title: "Towers",
        format: "16:9",
        sources: {
          research: "off",
          article: "generate",
          audio: "off",
          images: "off",
          thumbnail: "off",
          video: "off",
        },
        articlePrompt: "Story",
        llm: { provider: "llm", model: "v1" },
        imagePrompts: [],
        values: {},
        provided: {},
        silenceGapSeconds: 0,
        imageSeconds: 15,
        zoomPercent: 22.5,
        motionStyle: "zoom",
        edgeSilenceSeconds: 0,
        social,
      },
      { article: "Write", "social.x": "Tease it." },
      false,
      { article: "Write", "social.x": "Tease it." },
    ).project;
    const revisionId = currentRevisionId(h.deps.db, project.id);
    if (!revisionId) throw new Error("Missing fixture revision");
    const template = createTemplateFromProject(h.deps, {
      id: randomUUID(),
      name: "Towers",
      projectId: project.id,
      revisionId,
    });
    if (!template.ok) throw new Error("Project template failed");
    expect(template.value.document.form.social).toEqual(social);
    expect(
      template.value.document.librarySnapshot?.prompts
        .filter((one) => one.kind === "post")
        .map((one) => [one.name, one.body]),
    ).toEqual([["Teaser", "Tease it."]]);
  } finally {
    h.close();
  }
});

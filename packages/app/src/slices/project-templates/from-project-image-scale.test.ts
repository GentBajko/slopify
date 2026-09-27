import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { startRun } from "../admission/start.js";
import { startFixture } from "../play-drafts/draft.fake.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import { createTemplateFromProject } from "./from-project.js";

// A run that scales its images plans the scaled count when it starts, and a template made from
// it keeps the ticked prompts and the setting rather than one prompt per planned image.
it("plans the scaled images at the start and keeps the setting in a template", () => {
  const h = startFixture();
  try {
    const project = startRun(
      h.deps,
      {
        title: "Long story",
        format: "16:9",
        sources: {
          research: "off",
          article: "generate",
          audio: "off",
          images: "generate",
          thumbnail: "off",
          video: "off",
        },
        articlePrompt: "Story",
        images: { provider: "image", model: "v1" },
        imagePrompts: [
          { name: "Wide", number: 2 },
          { name: "Close", number: 1 },
        ],
        // Two hours at one image every 2 minutes.
        imageScale: { perHour: 30, words: 18000 },
        values: {},
        provided: {},
        silenceGapSeconds: 0,
        imageSeconds: 15,
        zoomPercent: 22.5,
        motionStyle: "mixed",
        edgeSilenceSeconds: 0,
      },
      { article: "Write", "imagePrompts.0": "A wide shot", "imagePrompts.1": "A close shot" },
      false,
      { article: "Write", "imagePrompts.0": "A wide shot", "imagePrompts.1": "A close shot" },
    ).project;
    const revisionId = currentRevisionId(h.deps.db, project.id);
    if (!revisionId) throw new Error("Missing fixture revision");
    const revision = revisionById(h.deps.db, project.id, revisionId);
    const prompts = revision?.content.imageOrder.map(
      (key) => revision.content.imageDefinitions[key]?.prompt,
    );
    expect(prompts).toHaveLength(60);
    // 57 more than the prompts' 3, handed out in turn: 2 + 29 and 1 + 28.
    expect(prompts?.filter((prompt) => prompt === "A wide shot")).toHaveLength(31);
    const template = createTemplateFromProject(h.deps, {
      id: randomUUID(),
      name: "Long stories",
      projectId: project.id,
      revisionId,
    });
    if (!template.ok) throw new Error("Project template failed");
    expect(template.value.document.form.imagePrompts).toEqual([
      { name: "Wide", number: "2" },
      { name: "Close", number: "1" },
    ]);
    expect(template.value.document.form.imageScale).toEqual({ every: "minutes", value: "2" });
    expect(template.value.document.expectedWords).toBe("18000");
  } finally {
    h.close();
  }
});

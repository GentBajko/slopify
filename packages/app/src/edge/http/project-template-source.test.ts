import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { startRun } from "../../slices/admission/start.js";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
import { createTemplateFromProject } from "../../slices/project-templates/from-project.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { projectTemplateRoutes } from "./project-templates.js";

it("snapshots a pinned project setup without copying generated output or approvals", async () => {
  const h = startFixture();
  try {
    const project = startRun(
      h.deps,
      {
        title: "Saved project",
        format: "9:16",
        sources: {
          research: "off",
          article: "generate",
          audio: "off",
          images: "off",
          thumbnail: "off",
          video: "off",
        },
        articlePrompt: "Deleted story",
        imagePrompts: [],
        values: { topic: "Arda" },
        provided: {},
        silenceGapSeconds: 0,
        imageSeconds: 15,
        zoomPercent: 22.5,
        motionStyle: "zoom",
        edgeSilenceSeconds: 0,
      },
      { article: "Write about Arda" },
      false,
      { article: "Write about {{topic}}" },
    ).project;
    const revisionId = currentRevisionId(h.deps.db, project.id);
    if (!revisionId) throw new Error("Missing fixture revision");
    const input = { id: randomUUID(), name: "Series", projectId: project.id, revisionId };
    const first = createTemplateFromProject(h.deps, input);
    if (!first.ok) throw new Error("Project template failed");
    expect(first.value.document.form.format).toBe("9:16");
    expect(first.value.document.form.values).toEqual({ topic: "Arda" });
    expect(first.value.document.librarySnapshot?.prompts[0]?.body).toBe("Write about {{topic}}");
    expect(first.value.document.form.provided.article).toBe("");
    expect(first.value.document.form.checkpoints).toEqual([]);
    expect(createTemplateFromProject(h.deps, input)).toEqual(first);
    expect(createTemplateFromProject(h.deps, { ...input, name: "Different" })).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(
      createTemplateFromProject(h.deps, { ...input, id: randomUUID(), revisionId: "stale" }),
    ).toEqual({ ok: false, reason: "conflict" });
    const app = new Hono().route("/api/project-templates", projectTemplateRoutes(h.deps));
    const response = await app.request(`/api/project-templates/from-project/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: randomUUID(), name: "HTTP snapshot", revisionId }),
    });
    expect(response.status).toBe(201);
    expect(h.ticks).toEqual([]);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
  } finally {
    h.close();
  }
});

it.each([undefined, false, true])(
  "retains saved project pronunciation preference %s in a template snapshot",
  (preference) => {
    const h = startFixture();
    try {
      const audio = {
        provider: "cartesia",
        model: "sonic-3.5",
        voice: "v",
        ...(preference === undefined ? {} : { usePronunciationGlossary: preference }),
      };
      const project = startRun(
        h.deps,
        {
          title: "Saved pronunciation",
          format: "16:9",
          sources: {
            research: "off",
            article: "provide",
            audio: "off",
            images: "off",
            thumbnail: "off",
            video: "off",
          },
          audio,
          imagePrompts: [],
          values: {},
          provided: { article: "Arda." },
          silenceGapSeconds: 0,
          imageSeconds: 15,
          zoomPercent: 22.5,
          motionStyle: "zoom",
          edgeSilenceSeconds: 0,
        },
        {},
      ).project;
      const revisionId = currentRevisionId(h.deps.db, project.id);
      if (revisionId === undefined) throw new Error("Missing fixture revision");
      const result = createTemplateFromProject(h.deps, {
        id: randomUUID(),
        name: "Pronunciation snapshot",
        projectId: project.id,
        revisionId,
      });
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(result.value.document.form.audio).toStrictEqual(audio);
      expect(Object.hasOwn(result.value.document.form.audio, "usePronunciationGlossary")).toBe(
        preference !== undefined,
      );
      expect(h.ticks).toEqual([]);
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
    } finally {
      h.close();
    }
  },
);

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RunDraft } from "../admission/model.js";
import { startRun } from "../admission/start.js";
import { startFixture } from "../play-drafts/draft.fake.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import { defaultVoicesSettings, type VoicesSettings } from "../voices/model.js";
import { createTemplateFromProject } from "./from-project.js";
import { makeNextChapter, nextBook } from "./next-chapter.js";

const narrator = {
  id: "narrator",
  name: "Narrator",
  role: "narrator" as const,
  voice: { provider: "google-tts", model: "gemini-2.5-flash-preview-tts", voice: "Kore" },
};

function chapter(voices: VoicesSettings | undefined): RunDraft {
  return {
    title: "The Storm",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "generate",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
    audio: { provider: "google-tts", model: "gemini-2.5-flash-preview-tts", voice: "Kore" },
    ...(voices === undefined ? {} : { voices }),
    imagePrompts: [],
    values: {},
    provided: { article: "It was a dark night." },
    silenceGapSeconds: 0,
    imageSeconds: 15,
    zoomPercent: 22.5,
    motionStyle: "mixed",
    edgeSilenceSeconds: 0,
  };
}

describe("makeNextChapter", () => {
  it("opens the next chapter with the book's speakers and settings and no words yet", () => {
    const h = startFixture();
    try {
      const voices: VoicesSettings = {
        ...defaultVoicesSettings("audiobook"),
        source: "attribute",
        speakers: [narrator],
        book: { title: "Sea Tales", chapter: 3 },
      };
      const project = startRun(h.deps, chapter(voices), {}, false, {}).project;
      const id = randomUUID();
      const made = makeNextChapter(h.deps, { id, projectId: project.id });
      if (!made.ok) throw new Error(made.message);
      const form = made.value.draft.document.form;
      expect(form.voices).toEqual({ ...voices, book: { title: "Sea Tales", chapter: 4 } });
      expect(form.title).toBe("Sea Tales · Chapter 4");
      expect(form.audio?.voice).toBe("Kore");
      expect(form.sources.article).toBe("provide");
      expect(form.provided.article).toBe("");
      // Pressed again: the same draft.
      const again = makeNextChapter(h.deps, { id, projectId: project.id });
      expect(again.ok && again.value.draft.id).toBe(id);

      // A template of a chapter is no chapter of the book.
      const revisionId = currentRevisionId(h.deps.db, project.id);
      if (revisionId === undefined) throw new Error("Missing fixture revision");
      expect(revisionById(h.deps.db, project.id, revisionId)?.config.voices?.book).toEqual({
        title: "Sea Tales",
        chapter: 3,
      });
      const template = createTemplateFromProject(h.deps, {
        id: randomUUID(),
        name: "Sea",
        projectId: project.id,
        revisionId,
      });
      expect(template.ok && template.value.document.form.voices).not.toHaveProperty("book");
    } finally {
      h.close();
    }
  });

  it("refuses a project that is not an audiobook, in words that say what to do", () => {
    const h = startFixture();
    try {
      const project = startRun(h.deps, chapter(undefined), {}, false, {}).project;
      const refused = makeNextChapter(h.deps, { id: randomUUID(), projectId: project.id });
      expect(refused).toMatchObject({ ok: false, reason: "not-an-audiobook" });
      expect(refused.ok ? "" : refused.message).toContain("Pick Audiobook under Speakers");
    } finally {
      h.close();
    }
  });

  it("starts a book from an audiobook made on its own at chapter 2", () => {
    expect(nextBook(" The Storm ", undefined)).toEqual({ title: "The Storm", chapter: 2 });
    expect(nextBook("x", { title: "Sea", chapter: 9 })).toEqual({ title: "Sea", chapter: 10 });
  });
});

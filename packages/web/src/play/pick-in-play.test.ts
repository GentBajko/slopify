import type { Entry, Prompt } from "@app/slices/library/model.js";
import { describe, expect, it } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { pickInPlay } from "./pick-in-play";

const prompt = (kind: Prompt["kind"], name: string): Prompt => ({
  id: "p",
  kind,
  name,
  body: "b",
  slots: [],
  updatedAt: "2026-09-27T10:00:00.000Z",
});

describe("pickInPlay", () => {
  it("picks an article prompt and switches the article to Generate", () => {
    const picked = pickInPlay(
      {
        ...freshDraftDocument,
        form: {
          ...freshDraftDocument.form,
          title: "Kept",
          sources: { ...freshDraftDocument.form.sources, article: "provide" },
        },
      },
      prompt("article", "Essay"),
    );
    expect(picked.document.form).toMatchObject({
      title: "Kept",
      articlePrompt: "Essay",
      sources: { article: "generate" },
    });
    expect(picked).toMatchObject({ section: "content", field: "articlePrompt" });
  });

  it("adds an image prompt once, with one image", () => {
    const once = pickInPlay(freshDraftDocument, prompt("image", "Ink"));
    const twice = pickInPlay(once.document, prompt("image", "Ink"));
    expect(twice.document.form.imagePrompts).toEqual([{ name: "Ink", number: "1" }]);
    expect(twice.field).toBe("imagePrompts.Ink.number");
  });

  it("turns on the step a description or shorts prompt belongs to", () => {
    expect(
      pickInPlay(freshDraftDocument, prompt("description", "Hooks")).document.form,
    ).toMatchObject({ youtubeDescription: true, descriptionPrompt: "Hooks" });
    expect(
      pickInPlay(freshDraftDocument, prompt("shorts", "Reels")).document.form.shorts,
    ).toMatchObject({ enabled: true, prompt: "Reels" });
  });

  it("picks an intro or an outro by name", () => {
    const entry: Entry = {
      id: "e",
      category: "outro",
      mode: "text",
      name: "Bye",
      body: "b",
      slots: [],
      updatedAt: "2026-09-27T10:00:00.000Z",
    };
    expect(pickInPlay(freshDraftDocument, entry)).toMatchObject({
      document: { form: { outro: "Bye" } },
      section: "outputs",
      field: "outro",
    });
  });
});

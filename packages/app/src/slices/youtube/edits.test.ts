import { describe, expect, it } from "vitest";
import { assembleDescription } from "./answer.js";
import {
  composeDescription,
  resolveField,
  resolveFields,
  splitDescription,
  withEdit,
  withoutEdit,
} from "./edits.js";

const written = assembleDescription({
  summary: "A walk through the history of ink.\n\nWith a surprise at the end.",
  chapters: [
    { start: 0, title: "Intro" },
    { start: 75, title: "Iron gall" },
    { start: 3725, title: "Today" },
  ],
  hashtags: ["#ink", "#history"],
  tags: ["ink", "history of ink"],
  pinnedComment: "Thanks for reading along.",
});

describe("splitDescription", () => {
  it("reads back the summary, chapters and hashtags the step wrote", () => {
    expect(splitDescription(written, "ink, history of ink")).toEqual({
      summary: "A walk through the history of ink.\n\nWith a surprise at the end.",
      chapters: "0:00 Intro\n1:15 Iron gall\n1:02:05 Today",
      hashtags: "#ink #history",
      tags: "ink, history of ink",
      pinnedComment: "",
    });
  });

  it("carries the pinned comment beside the description", () => {
    expect(splitDescription(written, "", "  Thanks for reading along.\n").pinnedComment).toBe(
      "Thanks for reading along.",
    );
  });

  it("keeps text it cannot place in the summary", () => {
    expect(splitDescription("Just a paragraph.", "")).toEqual({
      summary: "Just a paragraph.",
      chapters: "",
      hashtags: "",
      tags: "",
      pinnedComment: "",
    });
  });

  it("composes the same description back, leaving out emptied parts", () => {
    const fields = splitDescription(written, "");
    expect(composeDescription(fields)).toBe(written);
    expect(composeDescription({ ...fields, chapters: "  " })).toBe(
      "A walk through the history of ink.\n\nWith a surprise at the end.\n\n#ink #history",
    );
  });
});

describe("resolveField", () => {
  it("shows the generated text until the user edits the field", () => {
    expect(resolveField("generated", undefined)).toEqual({ text: "generated", edited: false });
  });

  it("shows the user's text while the generated text is the one it was edited from", () => {
    expect(resolveField("generated", { base: "generated", text: "mine" })).toEqual({
      text: "mine",
      edited: true,
    });
  });

  it("keeps the user's text when the description is written again, and offers the new one", () => {
    expect(resolveField("regenerated", { base: "generated", text: "mine" })).toEqual({
      text: "mine",
      edited: true,
      pending: "regenerated",
    });
  });

  it("has nothing to choose when the new text is what the user wrote", () => {
    expect(resolveField("mine", { base: "generated", text: "mine" })).toEqual({
      text: "mine",
      edited: false,
    });
  });

  it("shows an edit before anything is generated, and nothing without one", () => {
    expect(resolveField(undefined, { base: "", text: "mine" })).toEqual({
      text: "mine",
      edited: true,
    });
    expect(resolveField(undefined, undefined)).toEqual({ text: "", edited: false });
  });

  it("merges field by field: an edited field survives, an untouched one follows", () => {
    const before = splitDescription(written, "ink");
    const edits = withEdit({}, "chapters", "0:00 Start\n1:15 Middle", before.chapters);
    const after = { ...before, summary: "A new summary.", chapters: "0:00 New\n1:00 Chapters" };
    const resolved = resolveFields(after, edits);
    expect(resolved.summary).toEqual({ text: "A new summary.", edited: false });
    expect(resolved.chapters).toEqual({
      text: "0:00 Start\n1:15 Middle",
      edited: true,
      pending: "0:00 New\n1:00 Chapters",
    });
    expect(resolved.tags).toEqual({ text: "ink", edited: false });
  });
});

describe("withEdit and withoutEdit", () => {
  it("saves the edit with its base, drops an edit equal to the generated text, and Use it drops it", () => {
    const edited = withEdit({}, "tags", "mine", "generated");
    expect(edited).toEqual({ tags: { base: "generated", text: "mine" } });
    expect(withEdit(edited, "tags", "generated", "generated")).toEqual({});
    // Keep mine: the same text against the new generated text.
    expect(withEdit(edited, "tags", "mine", "regenerated")).toEqual({
      tags: { base: "regenerated", text: "mine" },
    });
    expect(withoutEdit(edited, "tags")).toEqual({});
  });
});

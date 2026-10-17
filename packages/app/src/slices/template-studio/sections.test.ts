import { describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { playDraftDocumentSchema, playDraftFormSchema } from "../play-drafts/schema.js";
import {
  affectedSections,
  documentSections,
  formSections,
  sectionOfField,
  sectionOfWork,
  sourceSections,
} from "./sections.js";

const fixture = draftFixture();
const base = fixture.document;
fixture.close();

describe("sectionOfField", () => {
  it("gives every field of Play's form a section, so a new field fails here", () => {
    const shape = playDraftFormSchema.unwrap().shape;
    expect(Object.keys(formSections).sort()).toEqual(Object.keys(shape).sort());
    const sources = shape.sources.unwrap().shape;
    expect(Object.keys(sourceSections).sort()).toEqual(Object.keys(sources).sort());
    const provided = shape.provided.unwrap().shape;
    for (const key of Object.keys(provided))
      expect([key, sectionOfField(["form", "provided", key])]).not.toEqual([key, null]);
  });

  it("gives every field of the template document a place, so a new field fails here", () => {
    const shape = playDraftDocumentSchema.unwrap().shape;
    expect(Object.keys({ ...documentSections, form: null }).sort()).toEqual(
      Object.keys(shape).sort(),
    );
  });

  it("finds a setting's section by its path", () => {
    expect(sectionOfField(["form", "audio", "voice"])).toBe("voice");
    expect(sectionOfField(["form", "sources", "images"])).toBe("pictures");
    expect(sectionOfField(["form", "provided", "shortsMusic"])).toBe("shorts");
    expect(sectionOfField(["form", "youtubeDescription"])).toBe("upload");
    expect(sectionOfField(["queue"])).toBe("schedule");
  });

  it("is null for what no section shows, or an unknown path", () => {
    expect(sectionOfField(["section"])).toBeNull();
    expect(sectionOfField(["form", "sources"])).toBeNull();
    expect(sectionOfField(["form", "nothing"])).toBeNull();
    expect(sectionOfField(["form", "sources", "toString"])).toBeNull();
    expect(sectionOfField([])).toBeNull();
  });
});

describe("sectionOfWork", () => {
  it.each([
    ["research:notes", "subject"],
    ["article:body", "script"],
    ["entry:intro", "script"],
    ["narration:body:1", "voice"],
    ["level:body", "voice"],
    ["image:harbor", "pictures"],
    ["images:scenes", "pictures"],
    ["thumbnail:1", "thumbnail"],
    ["export:video", "video"],
    ["shorts:1:render", "shorts"],
    ["youtube:description", "upload"],
    ["document:pdf", "document"],
    ["review:article:body", "reviews"],
  ])("puts %s in %s", (key, section) => {
    expect(sectionOfWork(key)).toBe(section);
  });

  it("is undefined for a key it doesn't know", () => {
    expect(sectionOfWork("mystery:1")).toBeUndefined();
  });
});

describe("affectedSections", () => {
  it("is empty when nothing changed", () => {
    expect(affectedSections(base, base)).toEqual([]);
  });

  it("outdates the voice and what is made from it when the voice changes", () => {
    const after = { ...base, form: { ...base.form, audio: { ...base.form.audio, voice: "nova" } } };
    expect(affectedSections(base, after)).toEqual([
      "voice",
      "video",
      "shorts",
      "reviews",
      "upload",
    ]);
  });

  it("outdates everything after the script when the article prompt changes", () => {
    const after = { ...base, form: { ...base.form, articlePrompt: "Story" } };
    expect(affectedSections(base, after)).toEqual([
      "script",
      "voice",
      "pictures",
      "video",
      "thumbnail",
      "shorts",
      "document",
      "reviews",
      "upload",
    ]);
  });

  it("outdates only the schedule when the queue choice changes", () => {
    expect(affectedSections(base, { ...base, queue: true })).toEqual(["schedule"]);
  });

  it("reads a switched source as its own section", () => {
    const after = {
      ...base,
      form: { ...base.form, sources: { ...base.form.sources, thumbnail: "generate" as const } },
    };
    expect(affectedSections(base, after)).toEqual(["thumbnail", "reviews"]);
  });

  it("ignores Play's open tab", () => {
    expect(affectedSections(base, { ...base, section: "style" })).toEqual([]);
  });
});

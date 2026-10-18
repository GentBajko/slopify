import { describe, expect, it } from "vitest";
import {
  keywordProblems,
  keywordUsesOf,
  placedProblems,
  placeOfKey,
  positionOf,
  textEntryProblems,
  upgradeLegacy,
  usesLegacy,
} from "./rules.js";

describe("keywordProblems", () => {
  it("finds nothing in a body without keywords", () => {
    expect(keywordProblems("Write about {{Topic}} for {{Title}}.", "article")).toEqual([]);
  });

  it("accepts a keyword where it works", () => {
    expect(keywordProblems("Summary: {{Slopify_Summary}}", "description")).toEqual([]);
  });

  it("marks an unknown Slopify_ name and says how to fix it", () => {
    expect(keywordProblems("About {{ Slopify_Wish }}.", "article")).toEqual([
      {
        kind: "unknown",
        name: "Slopify_Wish",
        at: 6,
        message:
          "{{Slopify_Wish}} at line 1, column 7 isn't a keyword Slopify fills: names starting with Slopify_ are Slopify's own. Rename it, e.g. {{Wish}}, or insert a keyword from the Insert bar above the text.",
      },
    ]);
  });

  it("reserves the prefix whatever its case", () => {
    expect(keywordProblems("{{slopify_title}}", "article").map((one) => one.kind)).toEqual([
      "unknown",
    ]);
  });

  it("lets an unknown name the prompt already had stay, so an old prompt still saves", () => {
    expect(keywordProblems("{{Slopify_Wish}}", "article", ["Slopify_Wish"])).toEqual([]);
  });

  it("marks a keyword used where it can't be filled, and names where it works", () => {
    expect(keywordProblems("Line\n  {{Slopify_Chapters}}", "article")).toEqual([
      {
        kind: "wrong-place",
        name: "Slopify_Chapters",
        at: 7,
        message:
          "{{Slopify_Chapters}} at line 2, column 3 can't be used in an Article prompt: it exists once the article is written, so never in the Article or Script prompt. Remove it; it works in Narration, Intro, Outro, Image, Thumbnail, Description, Shorts, Review and Post.",
      },
    ]);
  });

  it("marks a picture keyword outside the picture prompts", () => {
    expect(keywordProblems("{{Slopify_Setting}}", "description").map((one) => one.kind)).toEqual([
      "wrong-place",
    ]);
  });

  it("marks every keyword in the title", () => {
    expect(keywordProblems("{{Slopify_Title}} part 2", "title")[0]?.message).toBe(
      "{{Slopify_Title}} at line 1, column 1 can't be used in the title: Slopify fills its keywords from the title, so the title can't use them. Remove it, or use a keyword of your own such as {{Title}}.",
    );
  });

  it("marks an old name where it works, as a warning to update", () => {
    expect(keywordProblems("{{Scene}}", "image")).toEqual([
      {
        kind: "legacy",
        name: "Scene",
        at: 0,
        message:
          "{{Scene}} at line 1, column 1 is the old name of {{Slopify_Scene}}. It keeps working; use Update to new names in the editor to rename it.",
      },
    ]);
  });

  // Before the keywords, an old name outside a picture prompt was plain text, sent as written.
  it("leaves an old name outside the picture prompts alone, as it always was", () => {
    expect(keywordProblems("{{Scene}} {{Appearance}}", "article")).toEqual([]);
  });

  it("marks each use of a name, so the editor can mark each in place", () => {
    expect(keywordProblems("{{Slopify_X}} {{Slopify_X}}", "image").map((one) => one.at)).toEqual([
      0, 14,
    ]);
  });

  it("ignores malformed slots, which the slot lint reports", () => {
    expect(keywordProblems("{{Slopify_X", "image")).toEqual([]);
  });
});

describe("usesLegacy", () => {
  it("says which old names a body uses", () => {
    expect(usesLegacy("{{Scene}} and {{ Appearance }}")).toEqual(["Scene", "Appearance"]);
    expect(usesLegacy("{{Slopify_Scene}}")).toEqual([]);
  });
});

describe("upgradeLegacy", () => {
  it("renames Appearance alone, leaving Scene", () => {
    expect(upgradeLegacy("{{Scene}}. {{ Appearance }} and {{Appearance}}", "Appearance")).toBe(
      "{{Scene}}. {{Slopify_Appearance}} and {{Slopify_Appearance}}",
    );
  });

  it("renames Scene alone", () => {
    expect(upgradeLegacy("{{Scene}} {{Appearance}}", "Scene")).toBe(
      "{{Slopify_Scene}} {{Appearance}}",
    );
  });

  it("returns a body without the old name unchanged", () => {
    expect(upgradeLegacy("No keywords here", "Scene")).toBe("No keywords here");
  });
});

describe("placeOfKey", () => {
  it("maps each rendered key to the place its prompt fills", () => {
    expect(placeOfKey("article")).toBe("article");
    expect(placeOfKey("article", { script: true })).toBe("script");
    expect(placeOfKey("narration")).toBe("narration");
    expect(placeOfKey("intro")).toBe("intro");
    expect(placeOfKey("outro")).toBe("outro");
    expect(placeOfKey("description")).toBe("description");
    expect(placeOfKey("shorts")).toBe("shorts");
    expect(placeOfKey("shortsImage")).toBe("image");
    expect(placeOfKey("referencePrompt")).toBe("image");
    expect(placeOfKey("imagePrompts.3")).toBe("image");
    expect(placeOfKey("thumbnailPrompt")).toBe("thumbnail");
    expect(placeOfKey("review.article")).toBe("review");
  });

  it("knows no place for a key it has never seen", () => {
    expect(placeOfKey("something")).toBeUndefined();
  });
});

describe("positionOf", () => {
  it("counts lines and columns from one", () => {
    expect(positionOf("ab\ncd", 4)).toBe("line 2, column 2");
  });
});

describe("keywordUsesOf", () => {
  it("names the first field using each costly keyword", () => {
    expect(
      keywordUsesOf([
        { field: "articlePrompt", place: "article", body: "{{Slopify_Title}}" },
        { field: "imagePrompts.0.name", place: "image", body: "{{Slopify_Hook}} {{Slopify_Mood}}" },
        { field: "thumbnailPrompt", place: "thumbnail", body: "{{Slopify_Summary}}" },
        { field: "descriptionPrompt", place: "description", body: "{{Slopify_Chapters}}" },
      ]),
    ).toEqual({
      digest: "imagePrompts.0.name",
      scenes: "imagePrompts.0.name",
      chapters: "descriptionPrompt",
    });
  });

  it("counts neither the old Scene name nor a keyword where it can't be filled", () => {
    expect(
      keywordUsesOf([
        { field: "imagePrompts.0.name", place: "image", body: "{{Scene}}" },
        { field: "articlePrompt", place: "article", body: "{{Slopify_Summary}}" },
      ]),
    ).toEqual({});
  });
});

describe("placedProblems", () => {
  it("refuses a keyword where it can't be filled, on the field that picked the prompt", () => {
    expect(
      placedProblems([{ field: "articlePrompt", place: "article", body: "{{Slopify_Hook}}" }], {}),
    ).toEqual([
      {
        field: "articlePrompt",
        message:
          "{{Slopify_Hook}} at line 1, column 1 can't be used in an Article prompt: it is written from the article, which doesn't exist yet when this prompt runs. Remove it; it works in Image, Thumbnail, Description, Shorts, Review and Post. Change the prompt in Library, or pick another one.",
      },
    ]);
  });

  it("refuses a keyword in the title with the title's own sentence", () => {
    expect(
      placedProblems([{ field: "title", place: "title", body: "{{Slopify_Title}}" }], {})[0]
        ?.message,
    ).toContain("can't be used in the title");
  });

  it("lets a name the person gave a value of their own through", () => {
    expect(
      placedProblems([{ field: "title", place: "title", body: "{{Slopify_Title}}" }], {
        Slopify_Title: "Mine",
      }),
    ).toEqual([]);
  });

  it("says each name once per field, and nothing about unknown or old names", () => {
    expect(
      placedProblems(
        [
          {
            field: "articlePrompt",
            place: "article",
            body: "{{Slopify_Hook}} {{Slopify_Hook}} {{Slopify_Wish}} {{Scene}}",
          },
        ],
        {},
      ),
    ).toHaveLength(1);
  });
});

describe("textEntryProblems", () => {
  it("refuses the release date in a Text intro, and says how to fix it", () => {
    expect(textEntryProblems("Out {{Slopify_Release_Date}}.", "intro")).toEqual([
      {
        field: "intro",
        message:
          "{{Slopify_Release_Date}} can't be used in a Text intro: Text is narrated as written, and the release date is only filled in when a step asks the AI model. Set this intro's Mode to LLM in Library → Intros & Outros, or remove the keyword.",
      },
    ]);
    expect(textEntryProblems("Thanks, {{Slopify_Channel}}.", "outro")).toEqual([]);
  });
});

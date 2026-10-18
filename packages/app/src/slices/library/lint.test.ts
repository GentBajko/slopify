import { describe, expect, it } from "vitest";
import { keywordWarnings, lintEntry, lintPrompt } from "./lint.js";
import { bodyMax, nameMax } from "./model.js";

function messages(body: string): readonly string[] {
  return lintPrompt({ kind: "article", name: "Dossier", body }).map((field) => field.message);
}

// The slot grammar, read through the save path that enforces it. The parser itself is
// covered beside it in admission/substitute.test.ts.
describe("lintPrompt slot grammar", () => {
  // Whitespace immediately inside the braces is stripped.
  it("accepts a slot padded with whitespace", () => {
    expect(messages("Write about {{  topic  }}.")).toEqual([]);
  });

  // Internal spaces included, `{{Middle of Words}}`.
  it("accepts a space in the middle of a name", () => {
    expect(messages("{{Middle of Words}}")).toEqual([]);
  });

  // Names are case-sensitive, so two spellings are two slots, not a clash.
  it("accepts two names that differ only by case", () => {
    expect(messages("{{Topic}} and {{topic}}")).toEqual([]);
  });

  // A name may hold any character but `{`, `}` and a newline. There is no escape
  // syntax, so a backslash is an ordinary character and never hides a slot.
  it("accepts punctuation and a backslash inside a name", () => {
    expect(messages("\\{{a-b_c.d/e}}")).toEqual([]);
  });

  it("accepts a body with no slots at all", () => {
    expect(messages("Plain prose with a { brace and a } brace.")).toEqual([]);
  });

  // An unclosed `{{` is a lint error shown on the body.
  it("refuses an unclosed opener and says where it is", () => {
    expect(lintPrompt({ kind: "article", name: "D", body: "Line one\nabout {{topic" })).toEqual([
      {
        field: "body",
        message: "The `{{` at line 2, column 7 is never closed. Add `}}` after the keyword name.",
      },
    ]);
  });

  // A name may not span a newline, so a closer on the next line never closes.
  it("refuses an opener whose closer is on the next line", () => {
    expect(messages("{{topic\n}}")).toEqual([
      "The `{{` at line 1, column 1 is never closed. Add `}}` after the keyword name.",
    ]);
  });

  // An empty `{{}}` is a lint error.
  it("refuses an empty slot", () => {
    expect(messages("a {{}} b")).toEqual([
      "The keyword at line 1, column 3 has no name. Write a name between `{{` and `}}`.",
    ]);
  });

  it("refuses a slot holding only whitespace", () => {
    expect(messages("a {{   }} b")).toEqual([
      "The keyword at line 1, column 3 has no name. Write a name between `{{` and `}}`.",
    ]);
  });

  // Braces nested inside a slot are a lint error.
  it("refuses braces nested inside a slot", () => {
    expect(messages("{{{{topic}}}}")).toEqual([
      "The keyword at line 1, column 1 contains a brace. Keywords cannot be placed inside other keywords.",
    ]);
  });

  it("refuses a single stray brace inside a slot", () => {
    expect(messages("{{a}b}}")).toEqual([
      "The keyword at line 1, column 1 contains a brace. Keywords cannot be placed inside other keywords.",
    ]);
  });

  it("reports every malformed slot, not only the first", () => {
    expect(messages("{{}} {{good}} {{bad")).toEqual([
      "The keyword at line 1, column 1 has no name. Write a name between `{{` and `}}`.",
      "The `{{` at line 1, column 15 is never closed. Add `}}` after the keyword name.",
    ]);
  });

  it("reads a stray closing brace after a slot as ordinary text", () => {
    expect(messages("{{topic}}}")).toEqual([]);
  });
});

describe("lintPrompt name and body", () => {
  it("passes a well-formed draft", () => {
    expect(lintPrompt({ kind: "image", name: "Oil painting", body: "{{topic}}" })).toEqual([]);
  });

  // Name required.
  it("refuses a blank name", () => {
    expect(lintPrompt({ kind: "article", name: "   ", body: "b" })).toEqual([
      { field: "name", message: "Enter a name." },
    ]);
  });

  it("accepts a name of exactly the maximum length", () => {
    expect(lintPrompt({ kind: "article", name: "n".repeat(nameMax), body: "b" })).toEqual([]);
  });

  it("refuses an over-long name", () => {
    expect(lintPrompt({ kind: "article", name: "n".repeat(nameMax + 1), body: "b" })).toEqual([
      { field: "name", message: `Keep the name to ${String(nameMax)} characters or fewer.` },
    ]);
  });

  // Body required, non-empty.
  it("refuses a blank body", () => {
    expect(lintPrompt({ kind: "article", name: "D", body: " \n\t " })).toEqual([
      { field: "body", message: "Enter the text." },
    ]);
  });

  it("refuses an over-long body", () => {
    expect(lintPrompt({ kind: "article", name: "D", body: "b".repeat(bodyMax + 1) })).toEqual([
      {
        field: "body",
        message: `The text is too long. Keep it to ${String(bodyMax)} characters or fewer.`,
      },
    ]);
  });

  it("reports the name and the body together", () => {
    expect(lintPrompt({ kind: "article", name: "", body: "{{" }).map((f) => f.field)).toEqual([
      "name",
      "body",
    ]);
  });
});

// One rule set for prompts and entries.
describe("lintEntry", () => {
  it("passes a well-formed entry", () => {
    expect(lintEntry({ category: "intro", mode: "text", name: "Welcome", body: "Hi." })).toEqual(
      [],
    );
  });

  it("applies the same slot grammar", () => {
    expect(lintEntry({ category: "outro", mode: "llm", name: "Sign off", body: "{{}}" })).toEqual([
      {
        field: "body",
        message: "The keyword at line 1, column 1 has no name. Write a name between `{{` and `}}`.",
      },
    ]);
  });

  it("refuses a blank name", () => {
    expect(lintEntry({ category: "intro", mode: "text", name: "", body: "Hi." })).toEqual([
      { field: "name", message: "Enter a name." },
    ]);
  });
});

describe("keywords Slopify fills", () => {
  it("refuses an unknown Slopify_ name and says how to rename it", () => {
    expect(messages("About {{Slopify_Wish}}.")).toEqual([
      "{{Slopify_Wish}} at line 1, column 7 isn't a keyword Slopify fills: names starting with Slopify_ are Slopify's own. Rename it, e.g. {{Wish}}, or insert a keyword from the Insert bar above the text.",
    ]);
  });

  it("lets an unknown name through when the stored prompt already had it", () => {
    expect(
      lintPrompt({ kind: "article", name: "D", body: "{{Slopify_Wish}}" }, ["Slopify_Wish"]),
    ).toEqual([]);
  });

  it("refuses an unknown name in an entry too", () => {
    expect(
      lintEntry({ category: "intro", mode: "text", name: "W", body: "{{Slopify_Wish}}" }),
    ).toHaveLength(1);
  });

  it("saves a keyword in the wrong place, and warns about it instead", () => {
    const draft = { kind: "article" as const, name: "D", body: "{{Slopify_Chapters}}" };
    expect(lintPrompt(draft)).toEqual([]);
    expect(keywordWarnings(draft).map((one) => one.message)).toEqual([
      "{{Slopify_Chapters}} at line 1, column 1 can't be used in an Article prompt: it exists once the article is written, so never in the Article or Script prompt. Remove it; it works in Narration, Intro, Outro, Image, Thumbnail, Description, Shorts, Review and Post.",
    ]);
  });

  it("warns about an old name in a picture prompt", () => {
    expect(
      keywordWarnings({ kind: "image", name: "P", body: "{{Appearance}}" }).map((one) => one.field),
    ).toEqual(["body"]);
  });

  it("warns about a keyword in the wrong entry", () => {
    expect(
      keywordWarnings({ category: "outro", mode: "llm", name: "O", body: "{{Slopify_Hook}}" }),
    ).toHaveLength(1);
  });

  it("has nothing to say about a prompt without keywords", () => {
    expect(keywordWarnings({ kind: "image", name: "P", body: "{{topic}}" })).toEqual([]);
  });

  it("warns about the release date in a Text entry only", () => {
    const body = "Out {{Slopify_Release_Date}}.";
    expect(keywordWarnings({ category: "intro", mode: "text", name: "I", body })).toHaveLength(1);
    expect(keywordWarnings({ category: "intro", mode: "llm", name: "I", body })).toEqual([]);
  });
});

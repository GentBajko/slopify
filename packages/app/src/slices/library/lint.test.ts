import { describe, expect, it } from "vitest";
import { lintEntry, lintPrompt } from "./lint.js";
import { bodyMax, nameMax } from "./model.js";

function messages(body: string): readonly string[] {
  return lintPrompt({ kind: "article", name: "Dossier", body }).map((field) => field.message);
}

// The grammar table of `logic/03` step 1 and step 2, read through the save path that
// enforces it. The parser itself is covered beside it in admission/substitute.test.ts.
describe("lintPrompt slot grammar", () => {
  // step 1: whitespace immediately inside the braces is stripped.
  it("accepts a slot padded with whitespace", () => {
    expect(messages("Write about {{  topic  }}.")).toEqual([]);
  });

  // step 1: internal spaces included, `{{Middle of Words}}`.
  it("accepts a space in the middle of a name", () => {
    expect(messages("{{Middle of Words}}")).toEqual([]);
  });

  // step 1: names are case-sensitive, so two spellings are two slots, not a clash.
  it("accepts two names that differ only by case", () => {
    expect(messages("{{Topic}} and {{topic}}")).toEqual([]);
  });

  // step 1: a name may hold any character but `{`, `}` and a newline. There is no escape
  // syntax, so a backslash is an ordinary character and never hides a slot.
  it("accepts punctuation and a backslash inside a name", () => {
    expect(messages("\\{{a-b_c.d/e}}")).toEqual([]);
  });

  it("accepts a body with no slots at all", () => {
    expect(messages("Plain prose with a { brace and a } brace.")).toEqual([]);
  });

  // step 2: an unclosed `{{` is a lint error shown on the body.
  it("refuses an unclosed opener and says where it is", () => {
    expect(lintPrompt({ kind: "article", name: "D", body: "Line one\nabout {{topic" })).toEqual([
      { field: "body", message: "The `{{` at line 2, column 7 is never closed." },
    ]);
  });

  // step 1: a name may not span a newline, so a closer on the next line never closes.
  it("refuses an opener whose closer is on the next line", () => {
    expect(messages("{{topic\n}}")).toEqual(["The `{{` at line 1, column 1 is never closed."]);
  });

  // step 2: an empty `{{}}` is a lint error.
  it("refuses an empty slot", () => {
    expect(messages("a {{}} b")).toEqual(["The slot at line 1, column 3 has no name."]);
  });

  it("refuses a slot holding only whitespace", () => {
    expect(messages("a {{   }} b")).toEqual(["The slot at line 1, column 3 has no name."]);
  });

  // step 2: braces nested inside a slot are a lint error.
  it("refuses braces nested inside a slot", () => {
    expect(messages("{{{{topic}}}}")).toEqual([
      "The slot at line 1, column 1 holds a brace; slots do not nest.",
    ]);
  });

  it("refuses a single stray brace inside a slot", () => {
    expect(messages("{{a}b}}")).toEqual([
      "The slot at line 1, column 1 holds a brace; slots do not nest.",
    ]);
  });

  it("reports every malformed slot, not only the first", () => {
    expect(messages("{{}} {{good}} {{bad")).toEqual([
      "The slot at line 1, column 1 has no name.",
      "The `{{` at line 1, column 15 is never closed.",
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

  // `logic/15` step 2: name required.
  it("refuses a blank name", () => {
    expect(lintPrompt({ kind: "article", name: "   ", body: "b" })).toEqual([
      { field: "name", message: "A name is required." },
    ]);
  });

  it("accepts a name of exactly the maximum length", () => {
    expect(lintPrompt({ kind: "article", name: "n".repeat(nameMax), body: "b" })).toEqual([]);
  });

  it("refuses an over-long name", () => {
    expect(lintPrompt({ kind: "article", name: "n".repeat(nameMax + 1), body: "b" })).toEqual([
      { field: "name", message: `A name is at most ${String(nameMax)} characters.` },
    ]);
  });

  // `logic/15` step 2: body required, non-empty.
  it("refuses a blank body", () => {
    expect(lintPrompt({ kind: "article", name: "D", body: " \n\t " })).toEqual([
      { field: "body", message: "A body is required." },
    ]);
  });

  it("refuses an over-long body", () => {
    expect(lintPrompt({ kind: "article", name: "D", body: "b".repeat(bodyMax + 1) })).toEqual([
      { field: "body", message: `A body is at most ${String(bodyMax)} characters.` },
    ]);
  });

  it("reports the name and the body together", () => {
    expect(lintPrompt({ kind: "article", name: "", body: "{{" }).map((f) => f.field)).toEqual([
      "name",
      "body",
    ]);
  });
});

// §Q121: one rule set for prompts and entries.
describe("lintEntry", () => {
  it("passes a well-formed entry", () => {
    expect(lintEntry({ category: "intro", mode: "text", name: "Welcome", body: "Hi." })).toEqual(
      [],
    );
  });

  it("applies the same slot grammar", () => {
    expect(lintEntry({ category: "outro", mode: "llm", name: "Sign off", body: "{{}}" })).toEqual([
      { field: "body", message: "The slot at line 1, column 1 has no name." },
    ]);
  });

  it("refuses a blank name", () => {
    expect(lintEntry({ category: "intro", mode: "text", name: "", body: "Hi." })).toEqual([
      { field: "name", message: "A name is required." },
    ]);
  });
});

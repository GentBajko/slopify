import type { EntryDraft, PromptDraft } from "@app/slices/library/model.js";
import { describe, expect, it } from "vitest";
import {
  bodyPieces,
  bodyProblems,
  draftProblems,
  draftWarnings,
  firstProblem,
  keywordSlots,
  nameProblems,
  oldNamesIn,
  slotNames,
} from "./draft-lint.js";

function draft(over: Partial<PromptDraft>): PromptDraft {
  return { kind: "article", name: "Dossier", body: "Write about {{topic}}.", ...over };
}

function entry(over: Partial<EntryDraft>): EntryDraft {
  return {
    category: "intro",
    mode: "text",
    name: "Cold open",
    body: "Today on {{topic}}.",
    ...over,
  };
}

describe("draftProblems", () => {
  it("finds nothing wrong with a well-formed draft", () => {
    expect(draftProblems(draft({}), [])).toEqual([]);
  });

  // One rule set over both libraries, so an entry is linted by the
  // same sentences a prompt is.
  it("lints an intro/outro entry by the same rules as a prompt", () => {
    expect(draftProblems(entry({}), [])).toEqual([]);
    expect(draftProblems(entry({ name: " " }), [])).toEqual([
      { field: "name", message: "Enter a name." },
    ]);
    expect(draftProblems(entry({ body: "one\ntwo {{bad\n" }), [])).toEqual([
      {
        field: "body",
        message: "The `{{` at line 2, column 5 is never closed. Add `}}` after the keyword name.",
      },
    ]);
  });

  // A text-mode entry is rendered with no call, so its body carries slots and is linted
  // exactly as an LLM-mode one is.
  it("lints a text-mode body's slots, not only an LLM-mode one's", () => {
    expect(draftProblems(entry({ mode: "text", body: "Today on {{" }), [])).toEqual([
      {
        field: "body",
        message: "The `{{` at line 1, column 10 is never closed. Add `}}` after the keyword name.",
      },
    ]);
    expect(slotNames(entry({ mode: "text" }).body)).toEqual(["topic"]);
  });

  it("carries the server's own sentence for an unclosed slot, with its line and column", () => {
    const problems = draftProblems(draft({ body: "one\ntwo {{bad\n" }), []);
    expect(problems).toEqual([
      {
        field: "body",
        message: "The `{{` at line 2, column 5 is never closed. Add `}}` after the keyword name.",
      },
    ]);
  });

  it("names an empty slot and a nested one", () => {
    expect(draftProblems(draft({ body: "{{}}" }), [])[0]?.message).toBe(
      "The keyword at line 1, column 1 has no name. Write a name between `{{` and `}}`.",
    );
    expect(draftProblems(draft({ body: "{{a{b}}" }), [])[0]?.message).toBe(
      "The keyword at line 1, column 1 contains a brace. Keywords cannot be placed inside other keywords.",
    );
  });

  it("refuses an unknown Slopify_ name, unless the stored prompt already had it", () => {
    const body = "Write about {{Slopify_Wish}}.";
    expect(draftProblems(draft({ body }), [])[0]?.message).toContain(
      "{{Slopify_Wish}} at line 1, column 13 isn't a keyword Slopify fills",
    );
    expect(draftProblems(draft({ body }), [], ["Slopify_Wish"])).toEqual([]);
    expect(draftProblems(entry({ body }), [], ["Slopify_Wish"])).toEqual([]);
  });

  it("appends a refusal the browser could not have known", () => {
    const refusal = { field: "name", message: "Another prompt already has this name." };
    expect(draftProblems(draft({}), [refusal])).toEqual([refusal]);
  });
});

describe("firstProblem", () => {
  it("is undefined when there is nothing to fix", () => {
    expect(firstProblem(draftProblems(draft({}), []))).toBeUndefined();
  });

  it("names the missing name before the malformed body", () => {
    const problems = draftProblems(draft({ name: "  ", body: "{{bad" }), []);
    expect(firstProblem(problems)).toBe("Enter a name.");
  });

  it("names the missing body once the name is there", () => {
    expect(firstProblem(draftProblems(draft({ body: "   " }), []))).toBe("Enter the text.");
  });

  it("names the earliest slot error when a body holds two", () => {
    const problems = draftProblems(draft({ body: "{{a{b}} then {{unclosed" }), []);
    expect(firstProblem(problems)).toBe(
      "The keyword at line 1, column 1 contains a brace. Keywords cannot be placed inside other keywords.",
    );
    expect(problems).toHaveLength(2);
  });

  it("names the collision when nothing else is wrong", () => {
    const problems = draftProblems(draft({}), [
      { field: "name", message: "Another prompt already has this name." },
    ]);
    expect(firstProblem(problems)).toBe("Another prompt already has this name.");
  });
});

describe("problems by field", () => {
  it("splits the name's problems from the body's", () => {
    const problems = draftProblems(draft({ name: "", body: "{{bad" }), []);
    expect(nameProblems(problems).map((problem) => problem.message)).toEqual(["Enter a name."]);
    expect(bodyProblems(problems)).toHaveLength(1);
  });
});

describe("slotNames", () => {
  it("lists each distinct name once, in order of appearance", () => {
    expect(slotNames("{{b}} {{a}} again {{b}}")).toEqual(["b", "a"]);
  });

  it("strips the whitespace inside the braces and keeps the spaces inside the name", () => {
    expect(slotNames("{{  Middle of Words  }}")).toEqual(["Middle of Words"]);
  });

  it("is case-sensitive", () => {
    expect(slotNames("{{topic}} {{Topic}}")).toEqual(["topic", "Topic"]);
  });

  it("finds nothing in a body with no slots", () => {
    expect(slotNames("plain text")).toEqual([]);
  });
});

describe("bodyPieces", () => {
  it("leaves a clean body in one unmarked piece", () => {
    expect(bodyPieces("Write about {{topic}}.")).toEqual([
      { start: 0, text: "Write about {{topic}}.", marked: false },
    ]);
  });

  it("is empty for an empty body", () => {
    expect(bodyPieces("")).toEqual([]);
  });

  it("marks the offending opener where it stands", () => {
    expect(bodyPieces("one {{bad")).toEqual([
      { start: 0, text: "one ", marked: false },
      { start: 4, text: "{{", marked: true },
      { start: 6, text: "bad", marked: false },
    ]);
  });

  it("marks every offender and nothing that is well formed", () => {
    expect(bodyPieces("{{ok}} {{}} {{bad")).toEqual([
      { start: 0, text: "{{ok}} ", marked: false },
      { start: 7, text: "{{", marked: true },
      { start: 9, text: "}} ", marked: false },
      { start: 12, text: "{{", marked: true },
      { start: 14, text: "bad", marked: false },
    ]);
  });

  it("marks an opener that ends the body", () => {
    expect(bodyPieces("tail {{")).toEqual([
      { start: 0, text: "tail ", marked: false },
      { start: 5, text: "{{", marked: true },
    ]);
  });

  it("rebuilds the body exactly", () => {
    const body = "a {{ok}} b {{}} c {{d{e}} f {{unclosed\nnext";
    expect(
      bodyPieces(body)
        .map((piece) => piece.text)
        .join(""),
    ).toBe(body);
  });
});

describe("draftWarnings", () => {
  it("warns about a keyword where it can't be filled, without refusing the save", () => {
    const misplaced = draft({ body: "Recap {{Slopify_Summary}}." });
    expect(draftProblems(misplaced, [])).toEqual([]);
    expect(draftWarnings(misplaced).map((one) => one.message)).toEqual([
      expect.stringContaining(
        "{{Slopify_Summary}} at line 1, column 7 can't be used in an Article prompt",
      ),
    ]);
    expect(draftWarnings(draft({}))).toEqual([]);
  });

  // Update to new names says those, with what each rename does.
  it("leaves the old names to the update banner", () => {
    expect(draftWarnings(draft({ kind: "image", body: "{{Scene}} {{Appearance}}" }))).toEqual([]);
    expect(oldNamesIn("{{Scene}} {{Appearance}} {{Scene}}", "image")).toEqual([
      "Scene",
      "Appearance",
    ]);
    expect(oldNamesIn("{{Scene}}", "article")).toEqual([]);
  });
});

describe("keywordSlots", () => {
  it("parts the keywords Slopify fills from the person's own, old names included", () => {
    expect(keywordSlots(["Topic", "Slopify_Title", "Scene", "Slopify_Wish", "Appearance"])).toEqual(
      {
        own: ["Topic", "Slopify_Wish"],
        filled: ["Slopify_Title", "Scene", "Appearance"],
      },
    );
  });
});

describe("bodyPieces with a place", () => {
  it("marks a keyword usable here, a misplaced one, an unknown one and an old name", () => {
    const body = "{{Slopify_Title}} {{Slopify_Summary}} {{Slopify_Wish}} {{Topic}}";
    expect(bodyPieces(body, { place: "article" })).toEqual([
      {
        start: 0,
        text: "{{Slopify_Title}}",
        marked: false,
        keyword: { name: "Slopify_Title", kind: "known" },
      },
      { start: 17, text: " ", marked: false },
      {
        start: 18,
        text: "{{Slopify_Summary}}",
        marked: false,
        keyword: {
          name: "Slopify_Summary",
          kind: "misuse",
          message: expect.stringContaining("can't be used in an Article prompt"),
        },
      },
      { start: 37, text: " ", marked: false },
      {
        start: 38,
        text: "{{Slopify_Wish}}",
        marked: false,
        keyword: {
          name: "Slopify_Wish",
          kind: "misuse",
          message: expect.stringContaining("isn't a keyword Slopify fills"),
        },
      },
      { start: 54, text: " {{Topic}}", marked: false },
    ]);
    expect(bodyPieces("{{ Scene }}", { place: "image" })).toEqual([
      {
        start: 0,
        text: "{{ Scene }}",
        marked: false,
        keyword: {
          name: "Scene",
          kind: "legacy",
          message: expect.stringContaining("old name of {{Slopify_Scene}}"),
        },
      },
    ]);
  });

  it("leaves an old name plain where it was always plain text, and a stored unknown name", () => {
    expect(bodyPieces("{{Scene}}", { place: "article" })).toEqual([
      { start: 0, text: "{{Scene}}", marked: false },
    ]);
    expect(
      bodyPieces("{{Slopify_Wish}}", { place: "article", grandfathered: ["Slopify_Wish"] }),
    ).toEqual([{ start: 0, text: "{{Slopify_Wish}}", marked: false }]);
  });

  it("keeps the brace errors and rebuilds the body exactly", () => {
    const body = "{{Slopify_Title}} {{bad {{Slopify_Hook}}\n{{}}";
    const pieces = bodyPieces(body, { place: "image" });
    expect(pieces.map((piece) => piece.text).join("")).toBe(body);
    expect(pieces.filter((piece) => piece.marked).map((piece) => piece.start)).toEqual([18, 41]);
    expect(pieces.filter((piece) => piece.keyword !== undefined)).toHaveLength(2);
  });
});

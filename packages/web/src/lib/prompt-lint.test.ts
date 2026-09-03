import type { PromptDraft } from "@app/slices/library/model.js";
import { describe, expect, it } from "vitest";
import {
  bodyPieces,
  bodyProblems,
  firstProblem,
  nameProblems,
  promptProblems,
  slotNames,
} from "./prompt-lint.js";

function draft(over: Partial<PromptDraft>): PromptDraft {
  return { kind: "article", name: "Dossier", body: "Write about {{topic}}.", ...over };
}

describe("promptProblems", () => {
  it("finds nothing wrong with a well-formed draft", () => {
    expect(promptProblems(draft({}), [])).toEqual([]);
  });

  it("carries the server's own sentence for an unclosed slot, with its line and column", () => {
    const problems = promptProblems(draft({ body: "one\ntwo {{bad\n" }), []);
    expect(problems).toEqual([
      { field: "body", message: "The `{{` at line 2, column 5 is never closed." },
    ]);
  });

  it("names an empty slot and a nested one", () => {
    expect(promptProblems(draft({ body: "{{}}" }), [])[0]?.message).toBe(
      "The slot at line 1, column 1 has no name.",
    );
    expect(promptProblems(draft({ body: "{{a{b}}" }), [])[0]?.message).toBe(
      "The slot at line 1, column 1 holds a brace; slots do not nest.",
    );
  });

  it("appends a refusal the browser could not have known", () => {
    const refusal = { field: "name", message: "Another prompt already has this name." };
    expect(promptProblems(draft({}), [refusal])).toEqual([refusal]);
  });
});

describe("firstProblem", () => {
  it("is undefined when there is nothing to fix", () => {
    expect(firstProblem(promptProblems(draft({}), []))).toBeUndefined();
  });

  it("names the missing name before the malformed body", () => {
    const problems = promptProblems(draft({ name: "  ", body: "{{bad" }), []);
    expect(firstProblem(problems)).toBe("A name is required.");
  });

  it("names the missing body once the name is there", () => {
    expect(firstProblem(promptProblems(draft({ body: "   " }), []))).toBe("A body is required.");
  });

  it("names the earliest slot error when a body holds two", () => {
    const problems = promptProblems(draft({ body: "{{a{b}} then {{unclosed" }), []);
    expect(firstProblem(problems)).toBe(
      "The slot at line 1, column 1 holds a brace; slots do not nest.",
    );
    expect(problems).toHaveLength(2);
  });

  it("names the collision when nothing else is wrong", () => {
    const problems = promptProblems(draft({}), [
      { field: "name", message: "Another prompt already has this name." },
    ]);
    expect(firstProblem(problems)).toBe("Another prompt already has this name.");
  });
});

describe("problems by field", () => {
  it("splits the name's problems from the body's", () => {
    const problems = promptProblems(draft({ name: "", body: "{{bad" }), []);
    expect(nameProblems(problems).map((problem) => problem.message)).toEqual([
      "A name is required.",
    ]);
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

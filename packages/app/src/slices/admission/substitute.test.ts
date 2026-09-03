import { describe, expect, it } from "vitest";
import { collectFields, detectSlots, render } from "./substitute.js";

describe("detectSlots", () => {
  it("strips the whitespace immediately inside the braces", () => {
    expect(detectSlots("Write about {{  topic  }} today.").names).toEqual(["topic"]);
  });

  it("keeps a space inside a name and keeps names case-sensitive", () => {
    expect(detectSlots("{{Middle of Words}} and {{middle of words}}").names).toEqual([
      "Middle of Words",
      "middle of words",
    ]);
  });

  it("lists each distinct name once, in order of first appearance", () => {
    expect(detectSlots("{{b}} {{a}} {{b}} {{c}}").names).toEqual(["b", "a", "c"]);
  });

  it("finds no slots in a body that has none", () => {
    expect(detectSlots("plain prose with a { brace and a } brace")).toEqual({
      names: [],
      errors: [],
    });
  });

  it("marks an unclosed opener", () => {
    expect(detectSlots("Write about {{topic")).toEqual({
      names: [],
      errors: [{ kind: "unclosed", at: 12 }],
    });
  });

  it("marks an opener whose closer is on the next line", () => {
    // A name may not contain a newline, so this never closes.
    expect(detectSlots("{{topic\n}}").errors).toEqual([{ kind: "unclosed", at: 0 }]);
  });

  it("marks an empty slot", () => {
    expect(detectSlots("a {{}} b {{   }} c")).toEqual({
      names: [],
      errors: [
        { kind: "empty", at: 2 },
        { kind: "empty", at: 9 },
      ],
    });
  });

  it("marks braces nested inside a slot", () => {
    expect(detectSlots("{{{{topic}}}}").errors).toEqual([{ kind: "nested", at: 0 }]);
    expect(detectSlots("{{a}b}}").errors).toEqual([{ kind: "nested", at: 0 }]);
  });

  it("keeps reading after an error so the editor marks every one", () => {
    const detected = detectSlots("{{}} {{good}} {{bad");
    expect(detected.names).toEqual(["good"]);
    expect(detected.errors).toEqual([
      { kind: "empty", at: 0 },
      { kind: "unclosed", at: 14 },
    ]);
  });

  it("reads a stray closing brace after a slot as ordinary text", () => {
    expect(detectSlots("{{topic}}}")).toEqual({ names: ["topic"], errors: [] });
  });
});

describe("collectFields", () => {
  it("groups a name used on both sides as common", () => {
    expect(collectFields(["{{topic}} {{tone}}"], ["{{topic}} {{style}}"])).toEqual([
      { name: "topic", group: "common" },
      { name: "tone", group: "text" },
      { name: "style", group: "image" },
    ]);
  });

  it("orders by first appearance across the text bodies then the image bodies", () => {
    expect(
      collectFields(["{{article}}", "{{intro}}"], ["{{picture}}", "{{thumb}}"]).map(
        (field) => field.name,
      ),
    ).toEqual(["article", "intro", "picture", "thumb"]);
  });

  it("asks for nothing when no selected body has a slot", () => {
    expect(collectFields(["plain"], [])).toEqual([]);
  });
});

describe("render", () => {
  it("replaces every occurrence of a name with its value", () => {
    expect(render("{{a}} and {{a}} and {{b}}", { a: "one", b: "two" })).toBe("one and one and two");
  });

  it("matches the value against the trimmed name", () => {
    expect(render("{{  topic }}", { topic: "rope" })).toBe("rope");
  });

  it("inserts a value containing braces literally and never expands it again", () => {
    expect(render("{{a}}", { a: "{{b}}", b: "expanded" })).toBe("{{b}}");
  });

  it("does not let a value's dollar sign act as a replacement pattern", () => {
    expect(render("{{a}}", { a: "$& and $1" })).toBe("$& and $1");
  });

  it("leaves an unknown name in place rather than emptying it", () => {
    expect(render("{{a}} {{b}}", { a: "one" })).toBe("one {{b}}");
  });

  it("does not read a slot's value off Object's prototype", () => {
    // Slot names are user-authored and free-form, so "constructor" and "toString"
    // are ordinary names, not accessors into a prototype nobody asked about.
    expect(render("{{constructor}}", {})).toBe("{{constructor}}");
    expect(render("{{toString}}", {})).toBe("{{toString}}");
    expect(render("{{hasOwnProperty}}", {})).toBe("{{hasOwnProperty}}");
  });

  it("substitutes a slot genuinely named after a prototype member", () => {
    expect(render("{{constructor}}", { constructor: "the maker" })).toBe("the maker");
  });

  it("leaves a malformed slot alone", () => {
    expect(render("{{a", { a: "one" })).toBe("{{a");
  });
});

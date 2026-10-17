import { describe, expect, it } from "vitest";
import { errnoCode, errorText, hasErrnoCode, internalError, isUnreachablePath } from "./errors.js";
import { jsonBetween } from "./json-answer.js";

describe("errors", () => {
  it("reads an Error's message or the text of anything else", () => {
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText("plain")).toBe("plain");
  });

  it("reads errno codes from any object", () => {
    const missing = Object.assign(new Error("x"), { code: "ENOENT" });
    expect(errnoCode(missing)).toBe("ENOENT");
    expect(hasErrnoCode({ code: "EEXIST" }, "EEXIST")).toBe(true);
    expect(errnoCode(new Error("x"))).toBeUndefined();
    expect(isUnreachablePath(missing)).toBe(true);
    expect(isUnreachablePath({ code: "EEXIST" })).toBe(false);
  });

  it("words the internal-error sentence once, keeping the screen's own retry button", () => {
    expect(internalError("a step is empty")).toBe(
      "Slopify hit an internal error (a step is empty). Try again; if it happens again, use Download diagnostics in Settings and report it.",
    );
    expect(internalError("x", "Use Try again on Document")).toContain(
      "(x). Use Try again on Document; if it happens again",
    );
  });
});

describe("jsonBetween", () => {
  it("finds the array or object wherever the answer put it", () => {
    expect(jsonBetween('Sure:\n```json\n["a","b"]\n```', "[", "]")).toEqual(["a", "b"]);
    expect(jsonBetween('x {"a":1} y', "{", "}")).toEqual({ a: 1 });
    expect(jsonBetween("none", "[", "]")).toBeUndefined();
    expect(jsonBetween("[not json]", "[", "]")).toBeUndefined();
  });
});

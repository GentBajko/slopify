import { describe, expect, it } from "vitest";
import type { Cue } from "./preparation.js";
import { prepareRequests } from "./steering.js";

describe("bounded steering", () => {
  it("carries style but never repeats a sound or loses source", () => {
    const source = "A long 😀 narration [literal] continues. Another sentence follows.";
    const cues: Cue[] = [
      { sentence: 1, kind: "instruction", text: "calm" },
      { sentence: 1, kind: "sound", sound: "sigh" },
      { sentence: 2, kind: "reset" },
    ];
    const result = prepareRequests(source, cues, 30);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.requests.map((part) => part.spokenText).join("")).toBe(source);
    expect(
      result.requests.every((part) => part.text.length <= 30 && /\S/u.test(part.spokenText)),
    ).toBe(true);
    expect(
      result.requests
        .map((part) => part.text)
        .join("")
        .match(/\[sigh\]/g),
    ).toHaveLength(1);
    expect(result.requests.at(-1)?.text).not.toContain("[calm]");
  });
  it("replaces carried style at a new sentence and leaves literal brackets intact", () => {
    const result = prepareRequests(
      "Hello! Next [reset].",
      [
        { sentence: 1, kind: "instruction", text: "calm" },
        { sentence: 2, kind: "instruction", text: "warm" },
      ],
      20,
    );
    expect(result).toEqual({
      ok: true,
      requests: [
        { text: "[calm] Hello! ", spokenText: "Hello! " },
        { text: "[warm] Next [reset].", spokenText: "Next [reset]." },
      ],
    });
  });
  it.each([0, 1, 1.5, Infinity, NaN])("refuses invalid cap %s", (cap) => {
    expect(prepareRequests("words", [], cap).ok).toBe(false);
  });
  it("refuses tags without space for a complete source point", () => {
    expect(prepareRequests("😀", [{ sentence: 1, kind: "instruction", text: "calm" }], 8).ok).toBe(
      false,
    );
    expect(prepareRequests("😀", [{ sentence: 1, kind: "instruction", text: "calm" }], 9)).toEqual({
      ok: true,
      requests: [{ text: "[calm] 😀", spokenText: "😀" }],
    });
  });
  it("preserves CRLF and long words at every character boundary", () => {
    const source = "Documentary😀word.\r\nA second sentence.";
    for (let cap = 2; cap <= 80; cap++) {
      const result = prepareRequests(source, [], cap);
      expect(result.ok, `cap ${cap}`).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.requests.map((part) => part.spokenText).join("")).toBe(source);
      for (const part of result.requests) {
        expect(part.text.length).toBeLessThanOrEqual(cap);
        expect(Buffer.from(part.text).toString("utf8")).toBe(part.text);
      }
    }
  });
  it("submits nothing for empty source and refuses an impossible whitespace-only part", () => {
    expect(prepareRequests(" \n", [], 8)).toEqual({ ok: true, requests: [] });
    expect(prepareRequests(`A${" ".repeat(40)}B`, [], 4).ok).toBe(false);
  });
  it("resets style inside a request without replaying it later", () => {
    const result = prepareRequests(
      "One. Two words keep going for a while.",
      [
        { sentence: 1, kind: "instruction", text: "calm" },
        { sentence: 2, kind: "reset" },
      ],
      30,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.requests[0]?.text).toContain("[calm] One. [reset]");
    expect(result.requests.slice(1).every((part) => !part.text.includes("[calm]"))).toBe(true);
  });
  it("prefers word boundaries instead of cutting ordinary words", () => {
    expect(prepareRequests("Words stay together.", [], 12)).toEqual({
      ok: true,
      requests: [
        { text: "Words stay ", spokenText: "Words stay " },
        { text: "together.", spokenText: "together." },
      ],
    });
  });
});

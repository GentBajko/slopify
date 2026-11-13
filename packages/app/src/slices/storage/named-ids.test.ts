import { describe, expect, it } from "vitest";
import { idsNamedIn } from "./named-ids.js";

// What SQL's instr() answers, one id at a time: the rule `idsNamedIn` must keep.
function oneByOne(ids: readonly string[], texts: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => texts.some((text) => text.includes(id))).sort();
}

describe("idsNamedIn", () => {
  it("finds the ids a text names and leaves out the ones it does not", () => {
    const texts = [
      '{"thumbnail":"01M76C4VNJQC8VKBT77E362GX4"}',
      '{"music":"01M76C4VNJQC8VKBT77E362GX9"}',
    ];
    const ids = [
      "01M76C4VNJQC8VKBT77E362GX4",
      "01M76C4VNJQC8VKBT77E362GX9",
      "01M76C4VNJQC8VKBT77E362GXZ",
    ];
    expect([...idsNamedIn(ids, texts)].sort()).toEqual([
      "01M76C4VNJQC8VKBT77E362GX4",
      "01M76C4VNJQC8VKBT77E362GX9",
    ]);
  });

  it("finds an id inside a longer word, as instr() does", () => {
    expect([...idsNamedIn(["a-video"], ['{"path":"assets/a-video-2/clip.mp4"}'])]).toEqual([
      "a-video",
    ]);
  });

  it("finds an id that starts where another candidate already began", () => {
    // Every place the shared beginning occurs is a candidate, overlapping ones included.
    expect([...idsNamedIn(["aaab", "aaac"], ["xaaaab"])]).toEqual(["aaab"]);
  });

  it("does not find an id that only begins like one the text names", () => {
    expect([...idsNamedIn(["a-upload", "a-upland"], ['{"provided":"a-upload"}'])]).toEqual([
      "a-upload",
    ]);
  });

  it("looks for ids of different lengths and different beginnings together", () => {
    const ids = ["a-video", "a-thumb", "b-upload", "zz", "a-very-long-asset-id"];
    const texts = ['{"one":"b-upload","two":"zz"}', '{"three":"a-very-long-asset-id"}'];
    expect([...idsNamedIn(ids, texts)].sort()).toEqual(oneByOne(ids, texts));
  });

  it("answers nothing when there are no ids or no texts", () => {
    expect(idsNamedIn([], ["anything"]).size).toBe(0);
    expect(idsNamedIn(["a-video"], []).size).toBe(0);
  });

  it("treats an empty id as instr() does: found in any text", () => {
    expect([...idsNamedIn([""], ["x"])]).toEqual([""]);
    expect(idsNamedIn([""], []).size).toBe(0);
  });

  it("agrees with looking for each id by itself on mixed material", () => {
    // A fixed pseudo-random mix, so a failure repeats.
    let seed = 20261112;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    const letters = "01ABMX-";
    const word = (length: number): string =>
      Array.from({ length }, () => letters[next() % letters.length]).join("");
    for (let round = 0; round < 40; round += 1) {
      const ids = Array.from({ length: 30 }, () => word(1 + (next() % 5)));
      const texts = Array.from({ length: 4 }, () => word(next() % 200));
      expect([...idsNamedIn(ids, texts)].sort(), `round ${String(round)}`).toEqual(
        oneByOne(ids, texts),
      );
    }
  });
});

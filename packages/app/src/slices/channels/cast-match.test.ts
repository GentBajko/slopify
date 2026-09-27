import { describe, expect, it } from "vitest";
import { castMentions } from "./cast-match.js";
import type { CastSnapshot } from "./model.js";

const member = (name: string, aliases: readonly string[] = []): CastSnapshot => ({
  name,
  aliases,
  description: "",
  images: ["a".repeat(64)],
});
const tiamat = member("Tiamat", ["the Dragon Queen", "Takhisis"]);
const names = (text: string, cast: readonly CastSnapshot[] = [tiamat]) =>
  castMentions(text, cast).map((row) => row.name);

describe("castMentions", () => {
  it("finds a name as a whole word, ignoring case", () => {
    expect(names("The rise of Tiamat")).toEqual(["Tiamat"]);
    expect(names("TIAMAT RETURNS")).toEqual(["Tiamat"]);
    expect(names("tiamat")).toEqual(["Tiamat"]);
  });

  it("treats punctuation and possessives as boundaries", () => {
    expect(names("Tiamat's lair")).toEqual(["Tiamat"]);
    expect(names("(Tiamat)")).toEqual(["Tiamat"]);
    expect(names("Lore: Tiamat, the five-headed")).toEqual(["Tiamat"]);
    expect(names("Tiamat—queen")).toEqual(["Tiamat"]);
  });

  it("does not match a name inside a longer word", () => {
    expect(names("Tiamatic runes")).toEqual([]);
    expect(names("PreTiamat era")).toEqual([]);
    expect(names("Tiamat2 is a sequel")).toEqual([]);
    // Plurals are not guessed: add one as an alias.
    expect(names("Two Tiamats")).toEqual([]);
  });

  it("matches aliases, including several words across any whitespace", () => {
    expect(names("Bow before the dragon  queen")).toEqual(["Tiamat"]);
    expect(names("the Dragon\nQueen")).toEqual(["Tiamat"]);
    expect(names("Takhisis wakes")).toEqual(["Tiamat"]);
    expect(names("the Dragon Queens")).toEqual([]);
  });

  it("matches letters outside English and names with symbols", () => {
    expect(names("Ærwyn rides", [member("Ærwyn")])).toEqual(["Ærwyn"]);
    expect(names("Ærwynn rides", [member("Ærwyn")])).toEqual([]);
    expect(names("A D&D story", [member("D&D")])).toEqual(["D&D"]);
    expect(names("Price of R2.D2 (droid)", [member("R2.D2")])).toEqual(["R2.D2"]);
    expect(names("R2xD2", [member("R2.D2")])).toEqual([]);
  });

  it("orders members by first mention, then by cast order", () => {
    const cast = [tiamat, member("Waterdeep"), member("Bahamut")];
    expect(names("Bahamut and Tiamat over Waterdeep", cast)).toEqual([
      "Bahamut",
      "Tiamat",
      "Waterdeep",
    ]);
    expect(names("Takhisis over Waterdeep; later Tiamat", cast)).toEqual(["Tiamat", "Waterdeep"]);
  });

  it("finds nothing without a cast or text", () => {
    expect(castMentions("Tiamat", undefined)).toEqual([]);
    expect(castMentions("  ", [tiamat])).toEqual([]);
    expect(castMentions("x", [member("  ")])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { castMentions } from "./cast-match.js";
import type { CastSnapshot } from "./model.js";

const member = (name: string, aliases: readonly string[] = []): CastSnapshot => ({
  name,
  aliases,
  description: "",
  images: ["a".repeat(64)],
});
const cleopatra = member("Cleopatra", ["the Last Pharaoh", "Philopator"]);
const names = (text: string, cast: readonly CastSnapshot[] = [cleopatra]) =>
  castMentions(text, cast).map((row) => row.name);

describe("castMentions", () => {
  it("finds a name as a whole word, ignoring case", () => {
    expect(names("The rise of Cleopatra")).toEqual(["Cleopatra"]);
    expect(names("CLEOPATRA RETURNS")).toEqual(["Cleopatra"]);
    expect(names("cleopatra")).toEqual(["Cleopatra"]);
  });

  it("treats punctuation and possessives as boundaries", () => {
    expect(names("Cleopatra's palace")).toEqual(["Cleopatra"]);
    expect(names("(Cleopatra)")).toEqual(["Cleopatra"]);
    expect(names("Lore: Cleopatra, the Ptolemaic")).toEqual(["Cleopatra"]);
    expect(names("Cleopatra—queen")).toEqual(["Cleopatra"]);
  });

  it("does not match a name inside a longer word", () => {
    expect(names("Cleopatraic runes")).toEqual([]);
    expect(names("PreCleopatra era")).toEqual([]);
    expect(names("Cleopatra2 is a sequel")).toEqual([]);
    // Plurals are not guessed: add one as an alias.
    expect(names("Two Cleopatras")).toEqual([]);
  });

  it("matches aliases, including several words across any whitespace", () => {
    expect(names("Bow before the last  pharaoh")).toEqual(["Cleopatra"]);
    expect(names("the Last\nPharaoh")).toEqual(["Cleopatra"]);
    expect(names("Philopator wakes")).toEqual(["Cleopatra"]);
    expect(names("the Last Pharaohs")).toEqual([]);
  });

  it("matches letters outside English and names with symbols", () => {
    expect(names("Ærwyn rides", [member("Ærwyn")])).toEqual(["Ærwyn"]);
    expect(names("Ærwynn rides", [member("Ærwyn")])).toEqual([]);
    expect(names("An R&D story", [member("R&D")])).toEqual(["R&D"]);
    expect(names("Price of R2.D2 (droid)", [member("R2.D2")])).toEqual(["R2.D2"]);
    expect(names("R2xD2", [member("R2.D2")])).toEqual([]);
  });

  it("orders members by first mention, then by cast order", () => {
    const cast = [cleopatra, member("Alexandria"), member("Ptolemy")];
    expect(names("Ptolemy and Cleopatra over Alexandria", cast)).toEqual([
      "Ptolemy",
      "Cleopatra",
      "Alexandria",
    ]);
    expect(names("Philopator over Alexandria; later Cleopatra", cast)).toEqual([
      "Cleopatra",
      "Alexandria",
    ]);
  });

  it("finds nothing without a cast or text", () => {
    expect(castMentions("Cleopatra", undefined)).toEqual([]);
    expect(castMentions("  ", [cleopatra])).toEqual([]);
    expect(castMentions("x", [member("  ")])).toEqual([]);
  });
});

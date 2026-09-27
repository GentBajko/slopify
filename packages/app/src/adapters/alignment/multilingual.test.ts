import { describe, expect, it } from "vitest";
import { alignWindow } from "./ctc.js";
import {
  alignmentSpecFor,
  compactLogits,
  multilingualModel,
  multilingualSpec,
  multilingualWords,
} from "./multilingual.js";
import { englishSpec } from "./spec.js";
import { greedy } from "./window.js";

const spoken = (text: string, language: string): readonly string[] =>
  multilingualWords(text, language).map((word) => word.spoken);

describe("multilingual normalisation", () => {
  it("keeps the language's own accented letters and lower-cases", () => {
    expect(spoken("¿Dónde está el Niño?", "es")).toEqual(["dónde", "está", "el", "niño"]);
    expect(spoken("Straße, Übung", "de")).toEqual(["straße", "übung"]);
    expect(spoken("Łódź żółć", "pl")).toEqual(["łódź", "żółć"]);
    expect(spoken("Příliš žluťoučký kůň", "cs")).toEqual(["příliš", "žluťoučký", "kůň"]);
  });

  it("reads letters from other Latin alphabets without their accents", () => {
    expect(spoken("Dvořák Straße", "es")).toEqual(["dvorák", "strasse"]);
    expect(spoken("Łódź", "de")).toEqual(["lodz"]);
  });

  it("joins elisions and the Catalan middle dot, and breaks at hyphens", () => {
    expect(spoken("l'homme", "fr")).toEqual(["lhomme"]);
    expect(spoken("col·lecció", "ca")).toEqual(["collecció"]);
    expect(spoken("peut-être", "fr")).toEqual(["peut être"]);
  });

  it("spells numbers, currency and percent in the language", () => {
    expect(spoken("1990", "de")).toEqual(["neunzehnhundertneunzig"]);
    expect(spoken("25%", "es")).toEqual(["veinticinco por ciento"]);
    expect(spoken("€5", "it")).toEqual(["cinque euro"]);
    expect(spoken("3,5", "fr")).toEqual(["trois virgule cinq"]);
    expect(spoken("Tom&Jerry", "nl")).toEqual(["tom en jerry"]);
  });

  it("picks the reading the speech used when a number has several", () => {
    const [word] = multilingualWords("1990", "de", "im jahr eintausendneunhundertneunzig");
    expect(word?.spoken).toBe("eintausendneunhundertneunzig");
  });

  it("refuses words in another alphabet with a plain fix", () => {
    expect(() => spoken("Москва", "es")).toThrow(/Latin letters only.*Edit project → Article/);
  });

  it("attaches punctuation-only tokens to the previous word", () => {
    expect(multilingualWords("hola —", "es")).toEqual([{ text: "hola —", spoken: "hola" }]);
  });
});

describe("multilingual spec", () => {
  it("keeps English on its own model and constants", () => {
    expect(alignmentSpecFor(undefined)).toBe(englishSpec);
    expect(alignmentSpecFor("en")).toBe(englishSpec);
    expect(englishSpec.labels).toBe(32);
    expect(englishSpec.gates).toEqual({
      meanPosterior: 0.48,
      poorScore: 0.2,
      poorShare: 0.3,
      maximumError: 0.42,
      anchorLetters: 20,
      anchorConfidence: 0.75,
    });
  });

  it("pins the multilingual model file", () => {
    expect(multilingualModel).toMatchObject({
      bytes: 247_576_761,
      sha256: "fcf939032d4091cf232d6a2e751e172d0409e0c926db6283526151cf50ceb577",
    });
    expect(multilingualModel.url).toContain("2d48b01b6429d9018f81914550565112d56f6ba7");
  });

  it("has one label per letter of the language plus blank and delimiter", () => {
    const spec = multilingualSpec("es");
    expect(spec.labels).toBe(2 + 26 + 7);
    expect(spec.modelLabels).toBe(9913);
    expect(spec.letters[spec.ids.ñ ?? 0]).toBe("ñ");
    expect(() => multilingualSpec("ru")).toThrow(/Russian/);
  });

  it("folds both cases of a letter into one column", () => {
    const logits = new Float32Array(2 * 4).fill(-Infinity);
    logits[1] = Math.log(0.25);
    logits[2] = Math.log(0.25);
    logits[4 + 3] = 0;
    const result = compactLogits(logits, 2, [[1, 2], [3], [0]]);
    expect(result[0]).toBeCloseTo(Math.log(0.5));
    expect(result[1]).toBe(-Infinity);
    expect(result[3 + 1]).toBeCloseTo(0);
  });

  it("aligns a window through the compacted logits", () => {
    const spec = multilingualSpec("es");
    const sequence = ["", "s", "", "í", " ", "", "n", "o", ""];
    const logits = new Float32Array(sequence.length * spec.labels);
    for (const [frame, letter] of sequence.entries()) {
      const id = letter === "" ? 0 : letter === " " ? spec.delimiter : (spec.ids[letter] ?? 0);
      for (let label = 0; label < spec.labels; label += 1)
        logits[frame * spec.labels + label] = label === id ? 8 : -8;
    }
    expect(greedy(logits, sequence.length, spec)).toBe("sí no");
    const result = alignWindow(logits, sequence.length, spec.words("Sí, no."), true, spec);
    expect(result.words.map((word) => word.text)).toEqual(["Sí,", "no."]);
    expect(result.words[1]?.start).toBeCloseTo(0.12);
  });
});

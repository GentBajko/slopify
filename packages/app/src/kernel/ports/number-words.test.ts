import { describe, expect, it } from "vitest";
import { numberForms } from "./number-words.js";

describe("numbers as a narrator reads them", () => {
  it("reads any year from 1000 as a year, first, keeping the plain reading", () => {
    // A medieval year, as a narrator says it: "eleven o four".
    expect(numberForms("1104")).toEqual([
      "ELEVEN O FOUR",
      "ELEVEN OH FOUR",
      "ONE THOUSAND ONE HUNDRED FOUR",
    ]);
    expect(numberForms("1157")[0]).toBe("ELEVEN FIFTY SEVEN");
    expect(numberForms("1300")[0]).toBe("THIRTEEN HUNDRED");
    expect(numberForms("1350s")[0]).toBe("THIRTEEN FIFTIES");
    expect(numberForms("1982")[0]).toBe("NINETEEN EIGHTY TWO");
  });

  it("leaves what is not a year alone", () => {
    expect(numberForms("2004")).toEqual(["TWO THOUSAND FOUR"]);
    expect(numberForms("62")).toEqual(["SIXTY TWO"]);
    expect(numberForms("999")).toEqual(["NINE HUNDRED NINETY NINE"]);
    expect(numberForms("1104.5")).toEqual(["ONE THOUSAND ONE HUNDRED FOUR POINT FIVE"]);
  });
});

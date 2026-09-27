import { describe, expect, it } from "vitest";
import { parseCsv, titlesFromCsv, titlesFromLines } from "./studio-csv.js";

describe("titles from a CSV", () => {
  it("reads YouTube Studio's Content export: the Video title column, not the id, no Total row", () => {
    const studio = [
      "﻿Content,Video title,Video publish time,Duration,Views,Watch time (hours)",
      "Total,,,,12345,678.9",
      'dQw4w9WgXcQ,"Cleopatra, Queen of the Nile",Sep 1 2026,812,5000,300.1',
      'aBcDeFgHiJk,"The ""Last"" Scholar\nExplained",Aug 30 2026,901,3000,200',
      "zYxWvUtSrQp,Ramesses the Great,Aug 1 2026,700,1000,50",
    ].join("\r\n");
    expect(titlesFromCsv(studio)).toEqual([
      "Cleopatra, Queen of the Nile",
      'The "Last" Scholar Explained',
      "Ramesses the Great",
    ]);
  });

  it("finds Title or Content headers in any case", () => {
    expect(titlesFromCsv("Views,TITLE\n10,Hypatia\n20,Archimedes\n")).toEqual([
      "Hypatia",
      "Archimedes",
    ]);
    expect(titlesFromCsv("content,views\nZiggurats,1\n")).toEqual(["Ziggurats"]);
  });

  it("falls back to the first text column, with or without a header", () => {
    expect(titlesFromCsv("Id,Name,Views\nabc,Hanging Gardens,10\ndef,Pyramids,3\n")).toEqual([
      "Hanging Gardens",
      "Pyramids",
    ]);
    expect(titlesFromCsv("Hanging Gardens,10\nPyramids,3\n")).toEqual([
      "Hanging Gardens",
      "Pyramids",
    ]);
  });

  it("reads semicolon-separated files", () => {
    expect(titlesFromCsv("Video title;Views\nA; 1\nB;2")).toEqual(["A", "B"]);
  });

  it("keeps commas and line breaks inside quotes as one field", () => {
    expect(parseCsv('a,"b,c\nd",e\n\nf,g')).toEqual([
      ["a", "b,c\nd", "e"],
      ["f", "g"],
    ]);
  });
});

it("pasted titles are one per line, blank lines dropped", () => {
  expect(titlesFromLines("  First video \r\n\nSecond   video\n")).toEqual([
    "First video",
    "Second video",
  ]);
});

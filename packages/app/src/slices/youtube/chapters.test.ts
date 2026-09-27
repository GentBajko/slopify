import { describe, expect, it } from "vitest";
import { chapterNotice, fitChapters } from "./chapters.js";

describe("fitChapters", () => {
  it("leaves chapters that already follow YouTube's rules exactly as written", () => {
    const text = "0:00 Intro\n1:15 Iron gall\n1:02:05 Today";
    expect(fitChapters(text, 4000)).toEqual({ text, adjustments: [] });
    expect(fitChapters(text)).toEqual({ text, adjustments: [] });
  });

  it("leaves text without chapters alone", () => {
    expect(fitChapters("", 100)).toEqual({ text: "", adjustments: [] });
    expect(fitChapters("Just a note", 100)).toEqual({ text: "Just a note", adjustments: [] });
  });

  it("moves the first chapter to 0:00", () => {
    const fit = fitChapters("0:05 Intro\n1:00 Middle\n2:00 End", 300);
    expect(fit.text).toBe("0:00 Intro\n1:00 Middle\n2:00 End");
    expect(fit.adjustments).toEqual(['moved the first, "Intro", from 0:05 to 0:00']);
  });

  it("merges a chapter shorter than ten seconds into the one before it", () => {
    const fit = fitChapters("0:00 Intro\n1:00 Blink\n1:06 Middle\n2:00 End", 300);
    expect(fit.text).toBe("0:00 Intro\n1:06 Middle\n2:00 End");
    expect(fit.adjustments).toEqual(['merged "Blink" (6 s) into "Intro"']);
  });

  it("merges a short first chapter into the next, which then starts at 0:00", () => {
    const fit = fitChapters("0:00 Cold open\n0:04 Intro\n1:00 Middle\n2:00 End", 300);
    expect(fit.text).toBe("0:00 Intro\n1:00 Middle\n2:00 End");
    expect(fit.adjustments).toEqual(['merged "Cold open" (4 s) into "Intro"']);
  });

  it("checks the last chapter against the video's length only when it is known", () => {
    const text = "0:00 Intro\n1:00 Middle\n2:00 End\n4:55 Bye";
    expect(fitChapters(text).adjustments).toEqual([]);
    const fit = fitChapters(text, 300);
    expect(fit.text).toBe("0:00 Intro\n1:00 Middle\n2:00 End");
    expect(fit.adjustments).toEqual(['merged "Bye" (5 s) into "End"']);
  });

  it("removes a chapter that starts after the video ends", () => {
    const fit = fitChapters("0:00 Intro\n1:00 Middle\n2:00 End\n9:00 Gone", 300);
    expect(fit.text).toBe("0:00 Intro\n1:00 Middle\n2:00 End");
    expect(fit.adjustments).toEqual([
      'removed "Gone" (9:00), which starts after the video ends at 5:00',
    ]);
  });

  it("puts chapters in time order, merging a repeated time", () => {
    const fit = fitChapters("0:00 Intro\n2:00 End\n1:00 Middle\n1:00 Twin", 300);
    expect(fit.text).toBe("0:00 Intro\n1:00 Middle\n2:00 End");
    expect(fit.adjustments).toEqual([
      "put the chapters in time order",
      'merged "Twin" (0 s) into "Middle"',
    ]);
  });

  it("merges again until every chapter lasts ten seconds", () => {
    const fit = fitChapters("0:00 A\n0:03 B\n0:06 C\n0:09 D\n1:00 E\n2:00 F", 300);
    expect(fit.text).toBe("0:00 D\n1:00 E\n2:00 F");
    expect(fit.adjustments).toEqual([
      'merged "A" (3 s) into "B"',
      'merged "B" (6 s) into "C"',
      'merged "C" (9 s) into "D"',
    ]);
  });

  it("leaves the list out when fewer than three chapters are left", () => {
    const fit = fitChapters("0:00 Intro\n0:30 Middle\n0:35 End", 60);
    expect(fit.text).toBe("");
    expect(fit.adjustments).toEqual([
      'merged "Middle" (5 s) into "Intro"',
      "left the chapter list out, since YouTube needs at least 3 chapters of 10 s or more and only 2 are left",
    ]);
    expect(fitChapters("0:00 Only", 60).adjustments.at(-1)).toContain("only 1 is left");
  });

  it("keeps the user's other lines where they were", () => {
    const fit = fitChapters("Chapters:\n0:02 Intro\n1:00 Middle\n2:00 End\nThanks!", 300);
    expect(fit.text).toBe("Chapters:\n0:00 Intro\n1:00 Middle\n2:00 End\nThanks!");
    const dropped = fitChapters("Chapters:\n0:00 Intro\n0:30 End\nThanks!", 300);
    expect(dropped.text).toBe("Chapters:\nThanks!");
  });

  it("writes times the way YouTube reads them once it changes anything", () => {
    const fit = fitChapters("00:03 Intro\n01:00 Middle\n1:02:00 End", 4000);
    expect(fit.text).toBe("0:00 Intro\n1:00 Middle\n1:02:00 End");
  });
});

describe("chapterNotice", () => {
  it("says nothing when nothing changed, and lists every change otherwise", () => {
    expect(chapterNotice([])).toBeUndefined();
    expect(
      chapterNotice(['moved the first, "Intro", from 0:05 to 0:00', 'merged "X" (6 s) into "Y"']),
    ).toBe(
      'Chapters adjusted for YouTube: moved the first, "Intro", from 0:05 to 0:00; merged "X" (6 s) into "Y".',
    );
  });
});

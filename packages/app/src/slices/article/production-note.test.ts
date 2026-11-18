import { describe, expect, it } from "vitest";
import { withoutProductionNote } from "./production-note.js";

// A model that works as an agent (the Claude Code provider) sometimes opens its answer with a
// line about its own work. Spoken aloud, that line is the first thing a listener hears, so it
// goes before the text is kept. Real narration never goes: every miss here leaves a note in,
// never takes a sentence of the story out.

const heading = "## The Silver Sword\n\nLong ago, in the courts of a mind flayer empire...\n";

describe("withoutProductionNote", () => {
  it("drops the real leaked note before the first heading", () => {
    const answer = `I've read all sixteen documents in full and am now writing the narration and its end matter.\n\n${heading}`;
    expect(withoutProductionNote(answer)).toBe(heading);
  });

  it("drops look-alike notes about reading sources or writing the article", () => {
    const notes = [
      "I have reviewed the research notes and will now write the article.",
      "I'm now writing the narration.",
      "Now writing the article and its end matter.",
      "Let me draft the narration now that I've read the sources.",
      "Here is the full narration, with its end matter.",
      "Here's the article:",
      "I read through every document you attached. Writing the script now.",
      "Okay, I've gone through the files and the brief.",
    ];
    for (const note of notes) {
      expect(withoutProductionNote(`${note}\n\n${heading}`), note).toBe(heading);
    }
  });

  it("drops several leading notes and a rule that separates them from the article", () => {
    const answer = `I've read all the documents.\n\nNow writing the narration.\n\n---\n\n${heading}`;
    expect(withoutProductionNote(answer)).toBe(heading);
  });

  it("keeps a title heading and everything after it", () => {
    const answer = `# The Githyanki and the Githzerai\n\n${heading}`;
    expect(withoutProductionNote(answer)).toBe(answer);
  });

  it("keeps real narration openings before the first heading", () => {
    const openings = [
      "Settle in, close your eyes, and let the dark of the Astral Sea carry you somewhere quiet.",
      "I have read many old chronicles by candlelight, and none is stranger than this one.",
      "Tonight we read of a people who wrote their history in silver.",
      "Here is a tale of two peoples born of one rebellion.",
      "I'm going to tell you a story about a queen who never dies.",
      "The documents of the Githzerai monasteries are written on slate, and they speak of a war.",
      "Let me take you to a fortress adrift in the Astral Sea.",
    ];
    for (const opening of openings) {
      const answer = `${opening}\n\n${heading}`;
      expect(withoutProductionNote(answer), opening).toBe(answer);
    }
  });

  it("keeps a paragraph that only starts with a note-like phrase but goes on as narration", () => {
    const long = `I've read the sources, the old ones say, ${"and the silver sword sang in the dark ".repeat(12)}`;
    const answer = `${long}\n\n${heading}`;
    expect(withoutProductionNote(answer)).toBe(answer);
  });

  it("strips a note that opens a text with no heading, like an intro or outro", () => {
    const intro = "Welcome back. Tonight, the Githyanki.\n\nSettle in.";
    expect(
      withoutProductionNote(`I've read the article and am now writing the intro.\n\n${intro}`),
    ).toBe(intro);
  });

  it("strips only the first paragraph when there is no heading", () => {
    const answer = "I've read the article.\n\nNow writing the outro.\n\nSleep well.";
    expect(withoutProductionNote(answer)).toBe("Now writing the outro.\n\nSleep well.");
  });

  it("keeps a text with no heading that opens with narration", () => {
    const outro = "That is where we leave the Githyanki.\n\nSleep well.";
    expect(withoutProductionNote(outro)).toBe(outro);
  });

  it("never leaves an empty text", () => {
    expect(withoutProductionNote("I've read the documents and am now writing the narration.")).toBe(
      "I've read the documents and am now writing the narration.",
    );
  });

  it("keeps the text unchanged when there is nothing to drop", () => {
    expect(withoutProductionNote(heading)).toBe(heading);
    expect(withoutProductionNote("")).toBe("");
  });
});

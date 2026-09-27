import { describe, expect, it } from "vitest";
import type { Speaker } from "./model.js";
import { formatScript, parseScript, scriptMessages } from "./script.js";

const speakers: Speaker[] = [
  { id: "host-1", name: "Alex", role: "host", voice: { provider: "p", model: "m", voice: "a" } },
  { id: "host-2", name: "Sam Lee", role: "host", voice: { provider: "p", model: "m", voice: "s" } },
];

describe("parseScript", () => {
  it("reads turns, sections and continuation lines", () => {
    const result = parseScript(
      [
        "# The start",
        "",
        "Alex: Welcome back.",
        "It is good to see you.",
        "",
        "**Sam Lee:** Thanks, Alex!",
        "",
        "## The middle",
        "",
        "alex: Time: five o'clock.",
      ].join("\n"),
      speakers,
    );
    expect(result).toEqual({
      ok: true,
      script: {
        turns: [
          { index: 1, speaker: "host-1", text: "Welcome back. It is good to see you.", section: 0 },
          { index: 2, speaker: "host-2", text: "Thanks, Alex!", section: 0 },
          { index: 3, speaker: "host-1", text: "Time: five o'clock.", section: 1 },
        ],
        sections: [
          { title: "The start", firstTurn: 1 },
          { title: "The middle", firstTurn: 3 },
        ],
      },
    });
  });

  it("keeps a colon line under a turn as part of that turn", () => {
    const result = parseScript("Alex: The plan:\nStep one: breathe.", speakers);
    expect(result.ok && result.script.turns[0]?.text).toBe("The plan: Step one: breathe.");
  });

  it("drops stage directions, emphasis and empty sections", () => {
    const result = parseScript(
      "# Empty\n\n# Real\n\nAlex: [laughs] That was *really* _good_.",
      speakers,
    );
    expect(result).toEqual({
      ok: true,
      script: {
        turns: [{ index: 1, speaker: "host-1", text: "That was really good.", section: 0 }],
        sections: [{ title: "Real", firstTurn: 1 }],
      },
    });
  });

  it("names the line spoken by someone who is not a speaker", () => {
    const result = parseScript("Alex: Hi.\n\nJordan: Hello.", speakers);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Line 3");
      expect(result.reason).toContain('"Jordan"');
      expect(result.reason).toContain("Alex, Sam Lee");
    }
  });

  it("refuses a paragraph that is not a turn", () => {
    const result = parseScript("Once upon a time.\n\nAlex: Hi.", speakers);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^Line 1 of the script is not a turn/);
  });

  it("refuses a paragraph after a blank line that is not a turn", () => {
    const result = parseScript("Alex: Hi.\n\nand then some.", speakers);
    expect(result.ok).toBe(false);
  });

  it("refuses a script without words", () => {
    const result = parseScript("# Title\n\nAlex: [silence]", speakers);
    expect(result).toEqual({
      ok: false,
      reason:
        "The script has no spoken turns. Write each turn as a speaker's name, a colon and their words (Alex, Sam Lee).",
    });
  });

  it("formats a script so it parses back to itself", () => {
    const parsed = parseScript("# One\n\nAlex: Hi.\n\nSam Lee: Hello.", speakers);
    if (!parsed.ok) throw new Error(parsed.reason);
    const text = formatScript(parsed.script, speakers);
    expect(text).toBe("# One\n\nAlex: Hi.\n\nSam Lee: Hello.\n");
    expect(parseScript(text, speakers)).toEqual(parsed);
  });
});

it("asks for the format with the speakers named and the notes first", () => {
  const messages = scriptMessages("podcast", speakers, "Talk about tides.", "Notes here");
  expect(messages[0]?.role).toBe("system");
  expect(messages[0]?.content).toContain("- Sam Lee - host");
  expect(messages[1]).toEqual({
    role: "user",
    content: "Research notes\n\nNotes here\n\nTalk about tides.",
  });
});

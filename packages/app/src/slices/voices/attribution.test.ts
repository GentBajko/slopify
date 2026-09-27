import { describe, expect, it } from "vitest";
import { attributionMessages, parseAttribution } from "./attribution.js";
import type { Speaker } from "./model.js";

const speakers: Speaker[] = [
  {
    id: "narrator",
    name: "Narrator",
    role: "narrator",
    voice: { provider: "p", model: "m", voice: "n" },
  },
  { id: "mara", name: "Mara", role: "character", voice: { provider: "p", model: "m", voice: "m" } },
];
const source =
  'The door creaked open. "Who is there?" Mara asked. Nobody answered, and the wind kept blowing through the empty hall.';

describe("parseAttribution", () => {
  it("accepts a split that keeps the text's words", () => {
    const result = parseAttribution(
      "Narrator: The door creaked open.\n\nMara: Who is there?\n\nNarrator: Mara asked. Nobody answered, and the wind kept blowing through the empty hall.",
      source,
      speakers,
    );
    expect(result.ok && result.script.turns.map((turn) => turn.speaker)).toEqual([
      "narrator",
      "mara",
      "narrator",
    ]);
  });

  it("refuses a split that leaves words out", () => {
    const result = parseAttribution(
      "Narrator: The door creaked open.\n\nMara: Who is there?",
      source,
      speakers,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toMatch(/^The speaker split left out \d+ of the text's 20 words/);
  });

  it("refuses a split that writes words of its own", () => {
    const result = parseAttribution(
      `Narrator: ${source} Then suddenly a terrible storm rolled in over the dark and silent hills.`,
      source,
      speakers,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^The speaker split added \d+ words/);
  });

  it("passes a script error through", () => {
    const result = parseAttribution("Ghost: Boo.", source, speakers);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('"Ghost"');
  });
});

it("sends the text as the last message, for the check to compare against", () => {
  const messages = attributionMessages(source, speakers);
  expect(messages.at(-1)).toEqual({ role: "user", content: source });
  expect(messages[0]?.content).toContain(
    "Give narration, description and dialogue tags to Narrator",
  );
});

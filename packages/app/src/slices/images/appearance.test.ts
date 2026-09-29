import { expect, it } from "vitest";
import { collectFields } from "../admission/substitute.js";
import {
  appearanceFor,
  appearanceMessages,
  checkAppearance,
  usesAppearance,
  withAppearance,
} from "./appearance.js";

const looks = {
  subject: { name: "The Keeper", aliases: ["the old keeper"], look: "A tall man in a grey coat." },
  characters: [
    { name: "Mara", aliases: ["the smuggler"], look: "A small woman with a red scarf." },
    { name: "Iven", aliases: [], look: "A boy with a lantern." },
  ],
};

it("knows a prompt that asks for the looks, and never asks the person to fill it", () => {
  expect(usesAppearance("A drawing.\n\nLooks: {{Appearance}}")).toBe(true);
  expect(usesAppearance("A drawing.")).toBe(false);
  expect(collectFields([], ["{{Topic}} {{Appearance}} {{Scene}}"]).map((f) => f.name)).toEqual([
    "Topic",
  ]);
});

it("asks for a web search of the subject and the named characters", () => {
  const messages = appearanceMessages({ title: "The lighthouse", article: "The article." });
  expect(messages[0]?.content).toContain("Search the web before you answer");
  expect(messages[0]?.content).toContain("most iconic");
  expect(messages[1]?.content).toContain("Article:\n\nThe article.");
  expect(appearanceMessages({ title: "The lighthouse", article: "" })[1]?.content).toBe(
    "Video: The lighthouse",
  );
});

it("takes the looks as JSON and says what was wrong otherwise", () => {
  expect(checkAppearance(`Found: ${JSON.stringify(looks)}`)).toEqual({
    ok: true,
    appearance: looks,
  });
  expect(checkAppearance("No idea.")).toMatchObject({ ok: false });
  expect(
    checkAppearance(JSON.stringify({ subject: { name: "X", look: " " }, characters: [] })),
  ).toMatchObject({ ok: false, reason: expect.stringContaining("no look") });
});

it("gives each picture the looks of the figures its scene names", () => {
  expect(appearanceFor(looks)).toBe("The Keeper: A tall man in a grey coat.");
  expect(appearanceFor(looks, "The old keeper and the smuggler hand Iven a letter.")).toBe(
    "The Keeper: A tall man in a grey coat.\nMara: A small woman with a red scarf.\nIven: A boy with a lantern.",
  );
  // The subject only when the scene shows it, unless it always goes in (a thumbnail).
  expect(appearanceFor(looks, "Mara on the pier.")).toBe("Mara: A small woman with a red scarf.");
  expect(appearanceFor(looks, "Mara on the pier.", { subjectAlways: true })).toBe(
    "The Keeper: A tall man in a grey coat.\nMara: A small woman with a red scarf.",
  );
  // A name inside another word is not that character.
  expect(appearanceFor(looks, "Marathon runners at dawn.")).toBe("");
  expect(withAppearance("Draw.\n\nLooks: {{Appearance}}", "X: Y.")).toBe("Draw.\n\nLooks: X: Y.");
  expect(withAppearance("Draw.\n\nLooks: {{Appearance}}\n\nMore.", "")).toBe("Draw.\n\nMore.");
});

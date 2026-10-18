import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { outputPath } from "../storage/layout.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";

const sourced = (text: string): string => `${text}\nSources\nhttps://example.test`;

function researchFixture(answer: (key: string) => string | undefined = () => undefined) {
  return narrationFixture("Provided article.", {
    config: {
      sources: {
        research: "generate",
        article: "provide",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      llm: { provider: "openrouter", model: "llm" },
      rendered: { article: "Research the rope trade." },
    },
    catalogue: {
      ...narrationCatalogue,
      llm: narrationCatalogue.llm.map((model) => ({
        ...model,
        llm: { ...model.llm, webSearch: true },
      })),
    },
    answer: (key) => {
      const given = answer(key);
      if (given !== undefined) return given;
      if (key === "research:planner") return "First\nSecond";
      if (key.startsWith("research:chapter:")) return sourced(`Finding for ${key}.`);
      return sourced("Final notes.");
    },
  });
}

it("plans, researches each chapter, writes the notes and stores what it sent", async () => {
  const h = await researchFixture();
  try {
    await h.pump();
    expect(h.calls.map((call) => call.key)).toEqual([
      "research:planner",
      "research:chapter:1",
      "research:chapter:2",
      "research:notes",
    ]);
    const view = h.view();
    const ready = (key: string, role: string) => {
      const row = view.outputs.find(
        (one) => one.workKey === key && one.output.role === role && one.selected,
      );
      if (row === undefined) throw new Error(`Missing ${role} of ${key}`);
      return readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path), "utf8");
    };
    expect(ready("research:notes", "notes")).toBe(sourced("Final notes."));
    const instructions = ready("research:notes", "instructions");
    for (const heading of ["Research outline", "Research chapter 1", "Research synthesis"])
      expect(instructions).toContain(heading);
    // Every model call is its own counted unit, with its own tokens.
    expect(h.count.mock.calls).toEqual(
      Array.from({ length: 4 }, () => [
        "stage.completed",
        {
          stage: "research",
          provider: "openrouter",
          model: "llm",
          tokensIn: 1,
          tokensOut: 2,
        },
        "p1",
      ]),
    );
  } finally {
    h.close();
  }
});

it.each([
  ["research:planner", " \n ", "empty answer"],
  ["research:chapter:2", "Notes with no list.", "had no sources"],
  ["research:notes", "Summary with no list.", "had no sources"],
])("refuses an unusable %s answer and asks for nothing after it", async (key, text, reason) => {
  const h = await researchFixture((asked) => (asked === key ? text : undefined));
  try {
    await expect(h.pump()).rejects.toThrow(reason);
    const asked = h.calls.map((call) => call.key);
    expect(asked.at(-1)).toBe(key);
    expect(h.view().outputs.some((row) => row.workKey === "research:notes" && row.selected)).toBe(
      false,
    );
  } finally {
    h.close();
  }
});

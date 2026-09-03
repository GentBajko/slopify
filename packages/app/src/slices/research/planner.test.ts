import { describe, expect, it } from "vitest";
import type { ResearchBrief } from "./planner.js";
import { briefText, chaptersFrom, plannerMessages, subAgentMessages } from "./planner.js";

const brief: ResearchBrief = {
  articlePrompt: "Write about rope, in three sections: history, materials, knots.",
  values: { topic: "rope", tone: "dry" },
};

function only(messages: readonly { readonly content: string }[]): string {
  expect(messages).toHaveLength(1);
  return messages[0]?.content ?? "";
}

describe("briefText", () => {
  it("carries the rendered prompt and every keyword value", () => {
    expect(briefText(brief)).toContain("Write about rope, in three sections");
    expect(briefText(brief)).toContain("topic: rope");
    expect(briefText(brief)).toContain("tone: dry");
  });

  it("says so when the run has no keyword values", () => {
    expect(briefText({ articlePrompt: "Anything", values: {} })).toContain("(none)");
  });
});

describe("plannerMessages", () => {
  // One built-in instruction composed from the keyword values and the rendered
  // article prompt, answered with the chapter list.
  it("asks one user turn for the chapters, from the prompt's own section guide", () => {
    const content = only(plannerMessages(brief));

    expect(plannerMessages(brief)[0]?.role).toBe("user");
    expect(content.startsWith("You are planning the web research for an article.")).toBe(true);
    expect(content).toContain("Write about rope, in three sections");
    expect(content).toContain("topic: rope");
    // From the section guide when there is one, proposed when there is not.
    expect(content).toContain("section guide");
    expect(content).toContain("propose the chapters");
    expect(content).toContain("one chapter title per line");
  });

  it("never asks the planner to search the web", () => {
    // The planner reads the prompt; only the sub-agents are grounded.
    expect(only(plannerMessages(brief)).toLowerCase()).not.toContain("search the web");
  });
});

describe("chaptersFrom", () => {
  it("reads one chapter per line", () => {
    expect(chaptersFrom("History of rope\nMaterials\nKnots")).toEqual([
      "History of rope",
      "Materials",
      "Knots",
    ]);
  });

  it("strips the numbering and bullets a model adds anyway", () => {
    expect(chaptersFrom("1. History\n2) Materials\n- Knots\n* Splices\n• Care")).toEqual([
      "History",
      "Materials",
      "Knots",
      "Splices",
      "Care",
    ]);
  });

  it("drops blank lines and surrounding whitespace", () => {
    expect(chaptersFrom("\n  History  \n\n\tMaterials\n\n")).toEqual(["History", "Materials"]);
  });

  // The invariant: no chapter is researched twice within one run.
  it("keeps the first of a repeated title, whatever its case", () => {
    expect(chaptersFrom("History\nMaterials\nhistory\nHISTORY")).toEqual(["History", "Materials"]);
  });

  it("answers with nothing when the model said nothing", () => {
    expect(chaptersFrom("")).toEqual([]);
    expect(chaptersFrom("   \n\n  ")).toEqual([]);
  });
});

describe("subAgentMessages", () => {
  const outline = ["History", "Materials", "Knots"];

  // One per chapter, web-grounded, answering that chapter's notes and its
  // sources.
  it("names the one chapter to research and the rest of the outline", () => {
    const content = only(subAgentMessages(brief, "Materials", outline));

    expect(content.startsWith("You are researching one chapter of an article on the web.")).toBe(
      true,
    );
    expect(content).toContain("Research this chapter and no other: Materials");
    expect(content).toContain("- History");
    expect(content).toContain("- Knots");
    expect(content).toContain("Write about rope, in three sections");
  });

  it("asks for plain-text notes ending in a Sources list", () => {
    const content = only(subAgentMessages(brief, "Knots", outline));

    expect(content).toContain("Search the web");
    expect(content).toContain('"Sources"');
    expect(content).toContain("plain-text notes");
  });
});

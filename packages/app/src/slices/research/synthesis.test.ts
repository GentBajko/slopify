import { describe, expect, it } from "vitest";
import type { ResearchBrief } from "./planner.js";
import type { Finding } from "./synthesis.js";
import { endsWithSources, sourcedAnswer, synthesisMessages } from "./synthesis.js";

const brief: ResearchBrief = {
  articlePrompt: "Write about rope.",
  values: { topic: "rope" },
};

const findings: readonly Finding[] = [
  { title: "History", notes: "Twisted fibre is older than writing.\n\nSources\nhttps://a" },
  { title: "Materials", notes: "Manila, sisal, nylon.\n\nSources\nhttps://b" },
];

describe("synthesisMessages", () => {
  // An editorial pass that selects and organizes, not a concatenation.
  it("hands the editor every sub-agent's findings and forbids concatenating them", () => {
    const messages = synthesisMessages(brief, findings);
    const content = messages[0]?.content ?? "";

    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(content.startsWith("You are the editor of the research behind an article.")).toBe(true);
    expect(content).toContain("--- History ---");
    expect(content).toContain("Twisted fibre is older than writing.");
    expect(content).toContain("--- Materials ---");
    expect(content).toContain("Manila, sisal, nylon.");
    expect(content).toContain("Do not");
    expect(content).toContain("concatenate");
  });

  // Plain-text notes ending in a Sources list.
  it("asks for plain text ending in a Sources list", () => {
    const content = synthesisMessages(brief, findings)[0]?.content ?? "";

    expect(content).toContain("plain-text notes");
    expect(content).toContain('"Sources"');
  });
});

describe("endsWithSources", () => {
  it("accepts a Sources line with URLs under it", () => {
    expect(endsWithSources("Notes.\n\nSources\nhttps://a\nhttps://b")).toBe(true);
  });

  it("accepts the headings a model dresses the line up in", () => {
    expect(endsWithSources("Notes.\n\n## Sources\nhttps://a")).toBe(true);
    expect(endsWithSources("Notes.\n\n**Sources**\nhttps://a")).toBe(true);
    expect(endsWithSources("Notes.\n\nSources:\nhttps://a")).toBe(true);
    expect(endsWithSources("Notes.\n\nSources Consulted\nhttps://a")).toBe(true);
  });

  it("refuses notes with no Sources line at all", () => {
    expect(endsWithSources("Notes with a link https://a and nothing else.")).toBe(false);
  });

  // The heading alone is not a list.
  it("refuses a Sources heading with nothing under it", () => {
    expect(endsWithSources("Notes.\n\nSources\n\n   ")).toBe(false);
    expect(endsWithSources("Sources")).toBe(false);
  });

  it("does not mistake the word for the heading", () => {
    expect(endsWithSources("The sources disagree on the date.")).toBe(false);
  });
});

describe("sourcedAnswer", () => {
  // An empty response counts as a failed attempt.
  it("names an empty answer", () => {
    expect(sourcedAnswer("the synthesis", "")).toBe("the synthesis answered with nothing");
    expect(sourcedAnswer("the synthesis", "  \n ")).toBe("the synthesis answered with nothing");
  });

  // Output lacking a Sources list counts as a failed attempt.
  it("names an answer with no Sources list", () => {
    expect(sourcedAnswer("the synthesis", "Notes and nothing else.")).toBe(
      "the synthesis answered with no Sources list",
    );
  });

  it("passes an answer that ends in its sources", () => {
    expect(sourcedAnswer("the synthesis", "Notes.\n\nSources\nhttps://a")).toBeUndefined();
  });
});

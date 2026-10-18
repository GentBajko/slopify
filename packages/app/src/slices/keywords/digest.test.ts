import { describe, expect, it } from "vitest";
import { checkDigest, digestMessages, digestNames } from "./digest.js";

const answer = {
  summary: " How a city  fell. ",
  hook: "It was sold.",
  thumbnailText: "SOLD",
  keyFacts: ["Walls were tall.", "- The siege lasted 90 days."],
  quote: "Silver buys everything.",
  tags: ["lost cities", " siege "],
};

describe("digestMessages", () => {
  it("asks for every digest keyword from the article", () => {
    const messages = digestMessages({ title: "The Gate", article: "The article." });
    for (const part of ["summary", "hook", "thumbnailText", "keyFacts", "quote", "tags"])
      expect(messages[0]?.content).toContain(`"${part}"`);
    expect(messages[1]?.content).toBe("Video: The Gate\n\nArticle:\n\nThe article.");
  });
});

describe("checkDigest", () => {
  it("turns the answer into each keyword's text", () => {
    expect(checkDigest(`Here: ${JSON.stringify(answer)}`)).toEqual({
      ok: true,
      digest: {
        Slopify_Summary: "How a city fell.",
        Slopify_Hook: "It was sold.",
        Slopify_Thumbnail_Text: "SOLD",
        Slopify_Key_Facts: "Walls were tall.\nThe siege lasted 90 days.",
        Slopify_Quote: "Silver buys everything.",
        Slopify_Tags: "lost cities, siege",
      },
    });
  });

  it("takes lists written as text", () => {
    const checked = checkDigest(
      JSON.stringify({ ...answer, keyFacts: "One.\nTwo.", tags: "a, b" }),
    );
    expect(checked.ok && checked.digest.Slopify_Key_Facts).toBe("One.\nTwo.");
    expect(checked.ok && checked.digest.Slopify_Tags).toBe("a, b");
  });

  it("refuses an answer that is not the digest, and says what to do", () => {
    expect(checkDigest("No JSON here.")).toEqual({
      ok: false,
      reason:
        "The AI model didn't answer with the keyword digest (summary, hook, thumbnail text, key facts, quote and tags). Use Try again; if it keeps happening, choose another model in the Providers section of Edit project.",
    });
    expect(checkDigest("{ not json }").ok).toBe(false);
    expect(checkDigest(JSON.stringify({ summary: "x" })).ok).toBe(false);
  });

  it("refuses a digest with an empty part, naming it", () => {
    const checked = checkDigest(JSON.stringify({ ...answer, hook: " ", tags: [] }));
    expect(checked.ok ? "" : checked.reason).toContain("({{Slopify_Hook}}, {{Slopify_Tags}})");
  });

  it("covers every digest keyword in the registry", () => {
    expect(digestNames).toEqual([
      "Slopify_Summary",
      "Slopify_Hook",
      "Slopify_Thumbnail_Text",
      "Slopify_Key_Facts",
      "Slopify_Quote",
      "Slopify_Tags",
    ]);
  });
});

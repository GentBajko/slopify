import { describe, expect, it } from "vitest";
import type { ArticleBrief } from "./continuation.js";
import { articleMessages, continuationMessages } from "./continuation.js";

// What the article's call is composed of, and what each continuation adds to it.

const brief: ArticleBrief = { articlePrompt: "Write about rope." };

describe("articleMessages", () => {
  it("puts the notes under a fixed header before the rendered prompt", () => {
    const messages = articleMessages({ articlePrompt: "Write about rope.", notes: "Rope facts." });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("Research notes\n\nRope facts.\n\nWrite about rope.");
  });

  it("sends the rendered prompt alone when research did not run", () => {
    expect(articleMessages(brief)[0]?.content).toBe("Write about rope.");
  });
});

describe("continuationMessages", () => {
  it("hands back the article so far as the model's own turn, then asks it to go on", () => {
    const base = articleMessages(brief);
    const messages = continuationMessages(base, "# Rope\n\nA bowline is tied by");

    expect(messages.slice(0, base.length)).toEqual(base);
    expect(messages[base.length]).toEqual({
      role: "assistant",
      content: "# Rope\n\nA bowline is tied by",
    });
    const asked = messages.at(-1);
    expect(asked?.role).toBe("user");
    expect(asked?.content).toContain("Continue from the exact character you stopped at");
    expect(asked?.content).toContain("Do not repeat");
    expect(messages).toHaveLength(base.length + 2);
  });
});

import { describe, expect, it } from "vitest";
import { checkPost, defaultPostPrompt, postMessages, postTarget, postText } from "./post-prompt.js";

describe("postTarget", () => {
  it("holds a written post to the site's free limit, never over 3000", () => {
    expect(postTarget("x")).toEqual({ platform: "x", max: 280, unit: "weighted" });
    expect(postTarget("bluesky")).toEqual({ platform: "bluesky", max: 300, unit: "graphemes" });
    expect(postTarget("reddit").max).toBe(3000);
  });
});

describe("postMessages", () => {
  it("asks for one post within the limit, without hashtags or links, from the article", () => {
    const [system, user] = postMessages({
      instruction: "",
      target: postTarget("linkedin"),
      title: "Towers",
      article: "The tower stood.",
    });
    expect(system?.content).toContain("one LinkedIn post");
    expect(system?.content).toContain(defaultPostPrompt);
    expect(system?.content).toContain("within 3000 characters");
    expect(system?.content).toContain("Leave out hashtags and links");
    expect(user?.content).toBe("Video: Towers\n\nArticle:\n\nThe tower stood.");
  });

  it("uses the picked prompt in place of the built-in one", () => {
    const [system] = postMessages({
      instruction: "  Be brief. ",
      target: postTarget("x"),
      title: "T",
      article: "A",
    });
    expect(system?.content).toContain("Be brief.");
    expect(system?.content).not.toContain(defaultPostPrompt);
  });
});

describe("checkPost", () => {
  it("keeps a post within the limit, without its quotes", () => {
    expect(postText(' "A tower." ')).toBe("A tower.");
    expect(postText("“Curly.”")).toBe("Curly.");
    expect(checkPost('"A tower."', postTarget("x"))).toBeUndefined();
  });

  it("refuses an empty post and one over the limit, saying what to do", () => {
    expect(checkPost(' "" ', postTarget("x"))).toMatch(/sent back an empty X post\. Use Try again/);
    expect(checkPost("a".repeat(301), postTarget("bluesky"))).toMatch(
      /Bluesky post is 301 characters; it may be at most 300\..*Library → Prompts → Post/,
    );
  });
});

import { describe, expect, it } from "vitest";
import { githubSlug, headingText, tutorialAnchors, tutorialHeadings } from "./anchors.js";

describe("tutorial anchors", () => {
  it("names a heading the way GitHub's wiki does", () => {
    expect(githubSlug("How Play is laid out")).toBe("how-play-is-laid-out");
    expect(githubSlug("Keyboard and Ctrl+K")).toBe("keyboard-and-ctrlk");
    expect(githubSlug("Try … again")).toBe("try--again");
    expect(githubSlug(headingText("The `update` command, **Docker** or [not](Install)"))).toBe(
      "the-update-command-docker-or-not",
    );
  });

  it("numbers a repeated heading and skips code", () => {
    const page = "# Title\n\n## Setting it\n\n```sh\n# not a heading\n```\n\n### Setting it\n";
    expect(tutorialHeadings(page).map((heading) => heading.anchor)).toEqual([
      "title",
      "setting-it",
      "setting-it-1",
    ]);
    expect(tutorialAnchors(page).has("not-a-heading")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { headingForAnchor, parseTutorialHref, rewriteTutorialLinks, splitTitle } from "./links.js";

describe("tutorial links", () => {
  const pages = new Set(["Home", "Install", "Play-Overview"]);

  it("points the wiki's links at Help → Tutorials, anchors kept", () => {
    const markdown =
      "See [Install](Install), [the rows](Play-Overview#how-play-is-laid-out), [below](#setup), [GitHub](https://github.com/GentBajko/slopify) and [gone](Missing).";
    expect(rewriteTutorialLinks(markdown, pages, "Home")).toBe(
      "See [Install](/help/tutorials/Install), [the rows](/help/tutorials/Play-Overview#how-play-is-laid-out), [below](/help/tutorials/Home#setup), [GitHub](https://github.com/GentBajko/slopify) and [gone](Missing).",
    );
  });

  it("reads an in-app address back", () => {
    expect(parseTutorialHref("/help/tutorials/Play-Overview#how-play-is-laid-out")).toEqual({
      page: "Play-Overview",
      anchor: "how-play-is-laid-out",
    });
    expect(parseTutorialHref("/help/tutorials/Install")).toEqual({
      page: "Install",
      anchor: undefined,
    });
    expect(parseTutorialHref("/settings")).toBeUndefined();
  });

  it("finds the heading an anchor names, repeats numbered", () => {
    const root = document.createElement("div");
    root.innerHTML = "<h1>Install</h1><h2>With Docker</h2><h3>Setting it</h3><h3>Setting it</h3>";
    expect(headingForAnchor(root, "with-docker")?.textContent).toBe("With Docker");
    expect(headingForAnchor(root, "setting-it-1")).toBe(root.querySelectorAll("h3")[1]);
    expect(headingForAnchor(root, "nowhere")).toBeUndefined();
  });
});

describe("a tutorial's title", () => {
  it("is split from the page, which the page header titles", () => {
    expect(splitTitle("# Install\n\nRun it.\n\n## With Docker\n")).toEqual({
      title: "Install",
      body: "Run it.\n\n## With Docker\n",
    });
    expect(splitTitle("No title here.")).toEqual({ title: undefined, body: "No title here." });
  });

  it("still counts toward a repeated anchor, as GitHub counts it", () => {
    const root = document.createElement("div");
    root.innerHTML = "<h2>Install</h2>";
    expect(headingForAnchor(root, "install-1", ["Install"])).toBe(root.querySelector("h2"));
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InlineProse, Prose, splitTitle } from "./parts.js";

afterEach(cleanup);

describe("an article read back as prose", () => {
  it("typesets headings, and collapses the six levels onto the type scale", () => {
    const { container } = render(<Prose markdown={"# Top\n\n## Under\n\n###### Deep"} />);
    const headings = [...container.querySelectorAll("h3")];
    expect(headings.map((heading) => heading.textContent)).toEqual(["Top", "Under", "Deep"]);
    expect(headings[0]?.className).toContain("text-title");
    expect(headings[1]?.className).toContain("text-row");
  });

  it("typesets a bulleted list as a list, not as its source text", () => {
    const { container } = render(<Prose markdown={"- one\n- two\n"} />);
    expect(container.querySelectorAll("ul li").length).toBe(2);
    expect(container.textContent).not.toContain("- one");
  });

  it("typesets a numbered list", () => {
    const { container } = render(<Prose markdown={"1. first\n2. second\n"} />);
    expect(container.querySelectorAll("ol li").length).toBe(2);
  });

  it("makes a link a link", () => {
    render(<Prose markdown="See [the notes](https://example.invalid/notes)." />);
    const link = screen.getByRole("link", { name: "the notes" });
    expect(link.getAttribute("href")).toBe("https://example.invalid/notes");
  });

  it("strips a javascript: url rather than rendering it", () => {
    const { container } = render(<Prose markdown="[bad](javascript:alert(1))" />);
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("bad");
    expect(link?.getAttribute("href")).toBe("");
  });

  it("renders both weights of emphasis", () => {
    const { container } = render(<Prose markdown="a **bold** and an *italic* run" />);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
  });

  it("renders inline code and a fenced block", () => {
    const { container } = render(<Prose markdown={"`inline`\n\n```\nblock\n```\n"} />);
    expect(container.querySelector("p code")?.textContent).toBe("inline");
    expect(container.querySelector("pre code")?.textContent).toBe("block\n");
  });

  it("renders a gfm table as a table", () => {
    const { container } = render(
      <Prose markdown={"| Year | Event |\n| --- | --- |\n| 1974 | Published |\n"} />,
    );
    expect(container.querySelectorAll("table th").length).toBe(2);
    expect(container.querySelectorAll("table td")[0]?.textContent).toBe("1974");
  });

  it("renders a blockquote and a rule", () => {
    const { container } = render(<Prose markdown={"> quoted\n\n---\n"} />);
    expect(container.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("keeps the prose measure the type scale locks", () => {
    const { container } = render(<Prose markdown="Body." />);
    expect(container.firstElementChild?.className).toContain("max-w-[75ch]");
  });

  it("renders nothing at all for an empty article", () => {
    const { container } = render(<Prose markdown="" />);
    expect(container.firstElementChild?.textContent).toBe("");
  });
});

describe("taking the article's own title off the top", () => {
  it("splits a leading heading off and keeps the rest as markdown", () => {
    const split = splitTitle("## The Archlich\n\nBody.");
    expect(split.title).toBe("The Archlich");
    expect(split.body).toBe("Body.");
  });

  it("has no title when the article opens with prose, and keeps every line", () => {
    expect(splitTitle("Just prose.")).toEqual({ title: undefined, body: "Just prose." });
  });

  it("has no title and no body for an empty article", () => {
    expect(splitTitle("")).toEqual({ title: undefined, body: "" });
  });

  it("leaves a heading that is not the first line where it stands", () => {
    const split = splitTitle("Lead-in.\n\n## Later");
    expect(split.title).toBeUndefined();
    expect(split.body).toBe("Lead-in.\n\n## Later");
  });

  it("leaves a hash with no space after it alone, because it is not a heading", () => {
    expect(splitTitle("#NotAHeading\n\nBody.").title).toBeUndefined();
  });

  it("takes only the heading line, not the paragraph wrapped under it", () => {
    const split = splitTitle("# Top\nand more\n\nBody.");
    expect(split.title).toBe("Top");
    expect(split.body).toBe("and more\n\nBody.");
  });

  it("hands the title over with its inline markup intact, for the renderer to typeset", () => {
    expect(splitTitle("# The **Archlich**").title).toBe("The **Archlich**");
  });
});

describe("the title line", () => {
  it("typesets its emphasis instead of showing the markers", () => {
    const { container } = render(<InlineProse markdown="The **Archlich**" />);
    expect(container.textContent).toBe("The Archlich");
    expect(container.querySelector("strong")?.textContent).toBe("Archlich");
  });

  it("stays on one line, with no block of its own", () => {
    const { container } = render(<InlineProse markdown="Plain title" />);
    expect(container.querySelector("p")).toBeNull();
  });
});

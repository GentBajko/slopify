import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hitRanges, readingHeadings } from "./reading.js";
import { ReadingView } from "./reading-view.js";

afterEach(cleanup);

const article = [
  "Opening words about rope.",
  "",
  "## Knots",
  "",
  "A knot holds rope. Rope is **strong**.",
  "",
  "```",
  "# not a heading",
  "```",
  "",
  "Materials",
  "---",
  "",
  "Hemp and nylon rope.",
].join("\n");

describe("readingHeadings", () => {
  it("finds ATX and setext headings outside code, each with its section's Markdown", () => {
    expect(readingHeadings(article)).toEqual([
      {
        level: 2,
        text: "Knots",
        markdown: "## Knots\n\nA knot holds rope. Rope is **strong**.\n\n```\n# not a heading\n```",
      },
      { level: 2, text: "Materials", markdown: "Materials\n---\n\nHemp and nylon rope." },
    ]);
  });

  it("finds every hit without regard to case", () => {
    expect(hitRanges("Rope, rope, ROPE", "rope")).toEqual([
      [0, 4],
      [6, 10],
      [12, 16],
    ]);
    expect(hitRanges("anything", "  ")).toEqual([]);
  });
});

describe("ReadingView", () => {
  it("marks search hits, counts them and steps through them", async () => {
    const user = userEvent.setup();
    render(
      <ReadingView markdown={article} label="Article content" what="article" onCopy={() => {}} />,
    );
    await user.type(screen.getByRole("searchbox", { name: "Search the article" }), "rope");
    const region = screen.getByRole("region", { name: "Article content" });
    await waitFor(() => expect(region.querySelectorAll("mark[data-hit]")).toHaveLength(4));
    expect(screen.getByText("1 of 4")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByText("2 of 4")).not.toBeNull();
    expect(region.querySelectorAll('mark[data-current="true"]')).toHaveLength(1);
    await user.clear(screen.getByRole("searchbox", { name: "Search the article" }));
    await user.type(screen.getByRole("searchbox", { name: "Search the article" }), "steel");
    expect(await screen.findByText("No matches")).not.toBeNull();
  });

  it("lists the headings as contents and copies a section or all of it as Markdown", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(
      <ReadingView markdown={article} label="Article content" what="article" onCopy={onCopy} />,
    );
    const contents = screen.getByRole("navigation", { name: "Contents of the article" });
    expect(
      within(contents)
        .getAllByRole("link")
        .map((one) => one.textContent),
    ).toEqual(["Knots", "Materials"]);
    const target = within(contents).getByRole("link", { name: "Materials" }).getAttribute("href");
    expect(document.getElementById((target ?? "").slice(1))?.textContent).toBe("Materials");

    await user.click(screen.getByRole("button", { name: "Copy section Materials" }));
    expect(onCopy).toHaveBeenLastCalledWith(
      "Materials\n---\n\nHemp and nylon rope.\n",
      'section "Materials"',
    );
    await user.click(screen.getByRole("button", { name: "Copy all" }));
    expect(onCopy).toHaveBeenLastCalledWith(`${article}\n`, "article");
  });

  it("shows what it is given while there is no text, with search off", () => {
    render(
      <ReadingView markdown="" label="Research notes" what="research notes" onCopy={() => {}}>
        <p>Not yet.</p>
      </ReadingView>,
    );
    expect(screen.getByText("Not yet.")).not.toBeNull();
    expect(
      (screen.getByRole("searchbox", { name: "Search the research notes" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });
});

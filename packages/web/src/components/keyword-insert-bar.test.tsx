import { keywordsFor } from "@app/slices/keywords/specs.js";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { KeywordInsertBar } from "./keyword-insert-bar";

afterEach(cleanup);

function Editor({
  start,
  place = "image",
}: {
  readonly start: string;
  readonly place?: "image" | "article" | "intro";
}) {
  const [body, setBody] = useState(start);
  return (
    <>
      <KeywordInsertBar place={place} targetId="body" value={body} onChange={setBody} />
      <textarea
        id="body"
        aria-label="Body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
    </>
  );
}

function box(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: "Body" }) as HTMLTextAreaElement;
}

describe("the Insert bar", () => {
  it("lists only the keywords this kind can use", () => {
    render(<Editor start="" place="article" />);
    const bar = screen.getByRole("toolbar", { name: "Insert a keyword Slopify fills" });
    const names = within(bar)
      .getAllByRole("button")
      .map((button) => button.getAttribute("data-keyword"));
    expect(names).toEqual(keywordsFor("article").map((spec) => spec.name));
    expect(names).not.toContain("Slopify_Summary");
    expect(screen.getByRole("button", { name: "About Keywords Slopify fills" })).not.toBeNull();
  });

  it("inserts at the caret and leaves the caret after the keyword, focus in the text", async () => {
    const user = userEvent.setup();
    render(<Editor start="A picture of ." />);
    box().setSelectionRange(13, 13);
    await user.click(screen.getByRole("button", { name: "Insert Scene" }));
    expect(box().value).toBe("A picture of {{Slopify_Scene}}.");
    expect(document.activeElement).toBe(box());
    expect([box().selectionStart, box().selectionEnd]).toEqual([30, 30]);
  });

  it("replaces the selected text", async () => {
    const user = userEvent.setup();
    render(<Editor start="Draw OLD now" />);
    box().setSelectionRange(5, 8);
    await user.click(screen.getByRole("button", { name: "Insert Mood" }));
    expect(box().value).toBe("Draw {{Slopify_Mood}} now");
  });

  it("shows what a keyword fills in, an example, when, where and its cost on hover and focus", async () => {
    render(<Editor start="" />);
    const chip = screen.getByRole("button", { name: "Insert Thumbnail Text" });
    fireEvent.pointerEnter(chip);
    const card = await screen.findByRole("tooltip");
    expect(card.textContent).toContain("{{Slopify_Thumbnail_Text}}");
    expect(card.textContent).toContain("Two to four words");
    expect(card.textContent).toContain("Example");
    expect(card.textContent).toContain("Works in");
    expect(card.textContent).toContain("Image, Thumbnail, Description, Shorts and Review");
    expect(card.textContent).toContain("Part of one AI call per run: the keyword digest");
    expect(chip.getAttribute("aria-describedby")).toBe(card.id);
    fireEvent.pointerLeave(chip);
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => {
      screen.getByRole("button", { name: "Insert Title" }).focus();
    });
    expect((await screen.findByRole("tooltip")).textContent).toContain("Free: no AI call.");
  });

  it("is one tab stop, moved through with the arrow keys, Home and End", async () => {
    const user = userEvent.setup();
    render(<Editor start="" place="intro" />);
    const chips = within(screen.getByRole("toolbar")).getAllByRole("button");
    expect(chips.filter((chip) => chip.tabIndex === 0)).toHaveLength(1);
    act(() => {
      chips[0]?.focus();
    });
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(chips[1]);
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(document.activeElement).toBe(chips.at(-1));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(chips[0]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(chips.at(-1));
    expect(chips.at(-1)?.tabIndex).toBe(0);
  });

  it("adds the keyword at the end when the text isn't on the page", async () => {
    const user = userEvent.setup();
    const changes: string[] = [];
    render(
      <KeywordInsertBar
        place="image"
        targetId="missing"
        value="x"
        onChange={(next) => changes.push(next)}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Insert Scene" }));
    expect(changes).toEqual(["x{{Slopify_Scene}}"]);
  });
});

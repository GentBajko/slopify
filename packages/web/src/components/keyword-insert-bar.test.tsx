import { keywordsFor } from "@app/slices/keywords/specs.js";
import { cleanup, render, screen, within } from "@testing-library/react";
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

const user = () => userEvent.setup();

async function openMenu(clicker: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await clicker.click(screen.getByRole("button", { name: "Insert a keyword Slopify fills" }));
  return screen.findByRole("menu", { name: "Insert a keyword Slopify fills" });
}

// A keyword's row, named by exactly what it inserts.
const row = (menu: HTMLElement, name: string) =>
  within(menu).getByRole("menuitem", { name: new RegExp(`^\\{\\{${name}\\}\\}`, "u") });

describe("the Insert menu", () => {
  it("lists only the keywords this kind can use, each as exactly what it inserts", async () => {
    const clicker = user();
    render(<Editor start="" place="article" />);
    const menu = await openMenu(clicker);
    const names = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.getAttribute("data-keyword"));
    expect(names).toEqual(keywordsFor("article").map((spec) => spec.name));
    expect(names).not.toContain("Slopify_Summary");
    // The token in the color that keyword takes in the text.
    const title = row(menu, "Slopify_Title");
    expect(title.querySelector(".font-mono")?.textContent).toBe("{{Slopify_Title}}");
    expect(title.querySelector(".font-mono")?.className).toContain("text-accent-ink");
  });

  it("says what each fills in, and the AI call it is part of, before it is picked", async () => {
    const clicker = user();
    render(<Editor start="" />);
    const menu = await openMenu(clicker);
    const thumbnailText = row(menu, "Slopify_Thumbnail_Text");
    expect(thumbnailText.textContent).toContain("Two to four words");
    expect(thumbnailText.textContent).toContain("Part of one AI call per run: the keyword digest");
    // A free keyword says nothing about a call.
    expect(row(menu, "Slopify_Title").textContent).not.toContain("AI call");
  });

  it("inserts at the caret and leaves the caret after the keyword, focus in the text", async () => {
    const clicker = user();
    render(<Editor start="A picture of ." />);
    box().setSelectionRange(13, 13);
    const menu = await openMenu(clicker);
    await clicker.click(row(menu, "Slopify_Scene"));
    expect(box().value).toBe("A picture of {{Slopify_Scene}}.");
    // The closing menu leaves the focus in the text, after the keyword.
    await new Promise((done) => setTimeout(done, 20));
    expect(document.activeElement).toBe(box());
    expect([box().selectionStart, box().selectionEnd]).toEqual([30, 30]);
  });

  it("replaces the selected text", async () => {
    const clicker = user();
    render(<Editor start="Draw OLD now" />);
    box().setSelectionRange(5, 8);
    const menu = await openMenu(clicker);
    await clicker.click(row(menu, "Slopify_Mood"));
    expect(box().value).toBe("Draw {{Slopify_Mood}} now");
  });

  it("is one button above the text, no wider than the editor", () => {
    render(<Editor start="" place="intro" />);
    const opener = screen.getByRole("button", { name: "Insert a keyword Slopify fills" });
    expect(opener.parentElement?.className).toContain("max-w-[80ch]");
    // The keywords themselves wait in the menu: nothing else to tab through on the way in.
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("adds the keyword at the end when the text isn't on the page", async () => {
    const clicker = user();
    const changes: string[] = [];
    render(
      <KeywordInsertBar
        place="image"
        targetId="missing"
        value="x"
        onChange={(next) => changes.push(next)}
      />,
    );
    const menu = await openMenu(clicker);
    await clicker.click(row(menu, "Slopify_Scene"));
    expect(changes).toEqual(["x{{Slopify_Scene}}"]);
  });
});

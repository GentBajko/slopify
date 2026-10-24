import { lintPrompt } from "@app/slices/library/lint.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useId, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DetectedSlots, offsetOf } from "./detected-slots";
import { bodyLines, SlotBody } from "./slot-body";

afterEach(cleanup);

function Editor({ start }: { readonly start: string }) {
  const [body, setBody] = useState(start);
  const lintId = useId();
  const lint = lintPrompt({ kind: "article", name: "x", body }).filter(
    (one) => one.field === "body",
  );
  return (
    <>
      <SlotBody
        id="body"
        value={body}
        invalid={lint.length > 0}
        describedBy={lint.length === 0 ? undefined : lintId}
        onChange={setBody}
      />
      <DetectedSlots slots={[]} body={body} lint={lint} lintId={lintId} />
    </>
  );
}

describe("prompt body", () => {
  it("cuts the text at each line break and keeps the marks at their offsets", () => {
    const lines = bodyLines("One {{Topic}}\n\nThree {{ open");
    expect(lines).toHaveLength(3);
    expect(lines[1]?.pieces).toEqual([]);
    expect(lines[2]?.pieces.find((piece) => piece.marked)?.start).toBe(21);
  });

  it("sets the text as prose with spell check, and counts the characters only near the limit", () => {
    const { container } = render(<Editor start={"Hello\nworld"} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(box.getAttribute("spellcheck")).toBe("true");
    expect(box.className).toContain("font-sans");
    expect(box.className).not.toContain("font-mono");
    // No line numbers beside the text, and no count while far from the limit.
    expect(container.querySelector("[data-slot=lint-overlay]")?.textContent).toBe("Helloworld");
    expect(screen.queryByText(/of 100,000 characters/u)).toBeNull();
    cleanup();

    render(<Editor start={"a".repeat(95_000)} />);
    expect(screen.getByText("95,000 of 100,000 characters")).not.toBeNull();
  });

  it("highlights each keyword of your own and leaves Slopify's in accent ink", () => {
    const { container } = render(
      <SlotBody
        id="body"
        value={"About {{Topic}} on {{Slopify_Channel}}, {{ Mood }} and {{}}."}
        place="article"
        invalid={false}
        describedBy={undefined}
        onChange={() => undefined}
      />,
    );
    const overlay = container.querySelector("[data-slot=lint-overlay]");
    expect(
      [...(overlay?.querySelectorAll("[data-own-keyword]") ?? [])].map((one) => one.textContent),
    ).toEqual(["{{Topic}}", "{{ Mood }}"]);
    expect(overlay?.querySelector("[data-keyword=Slopify_Channel]")?.className).toContain(
      "text-accent-ink",
    );
    // The text reads the same with its marks: nothing is added or moved.
    expect(overlay?.textContent).toBe(
      "About {{Topic}} on {{Slopify_Channel}}, {{ Mood }} and {{}}.",
    );
  });

  it("jumps from a lint sentence to the marked brace", async () => {
    const user = userEvent.setup();
    render(<Editor start={"Line one\nand {{ open"} />);
    const offset = offsetOf(
      "Line one\nand {{ open",
      "The `{{` at line 2, column 5 is never closed.",
    );
    expect(offset).toBe(13);
    await user.click(screen.getByRole("button", { name: "Go to line 2, column 5" }));
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(box);
    expect([box.selectionStart, box.selectionEnd]).toEqual([13, 15]);
  });
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("keywords in the prompt body", () => {
  function Body({ start }: { readonly start: string }) {
    const [body, setBody] = useState(start);
    return (
      <SlotBody
        id="body"
        value={body}
        invalid={false}
        describedBy={undefined}
        place="article"
        onChange={setBody}
      />
    );
  }

  it("marks a keyword usable here, a misuse and an old name, apart from the person's own", () => {
    const { container } = render(
      <Body start={"{{Slopify_Title}} {{Slopify_Summary}}\n{{Topic}} {{Slopify_Wish}}"} />,
    );
    const marks = [...container.querySelectorAll("[data-keyword]")].map((span) => [
      span.getAttribute("data-keyword"),
      span.getAttribute("data-keyword-kind"),
    ]);
    expect(marks).toEqual([
      ["Slopify_Title", "known"],
      ["Slopify_Summary", "misuse"],
      ["Slopify_Wish", "misuse"],
    ]);
  });

  it("shows what a keyword fills in when the pointer is over it, with the misuse said", async () => {
    const { container } = render(<Body start="Recap: {{Slopify_Summary}}" />);
    const span = container.querySelector('[data-keyword="Slopify_Summary"]');
    if (!(span instanceof HTMLElement)) throw new Error("no keyword mark");
    span.getBoundingClientRect = () => rect(100, 20, 150, 20);
    const box = screen.getByRole("textbox");
    fireEvent.mouseMove(box, { clientX: 10, clientY: 25 });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseMove(box, { clientX: 120, clientY: 25 });
    const card = await screen.findByRole("tooltip");
    expect(card.textContent).toContain("{{Slopify_Summary}}");
    expect(card.textContent).toContain("Two or three sentences");
    expect(card.textContent).toContain("can't be used in an Article prompt");
    expect(box.getAttribute("aria-describedby")).toContain(card.id);
    fireEvent.mouseLeave(box);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the card while the caret is inside a keyword, so the keyboard reaches it", async () => {
    render(<Body start="By {{Slopify_Channel}}." />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    box.setSelectionRange(8, 8);
    fireEvent.select(box);
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "The name of the project's channel.",
    );
    box.setSelectionRange(1, 1);
    fireEvent.select(box);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("says an old name keeps working on its card", async () => {
    function Image() {
      const [body, setBody] = useState("{{Appearance}}");
      return (
        <SlotBody
          id="body"
          value={body}
          invalid={false}
          describedBy={undefined}
          place="image"
          onChange={setBody}
        />
      );
    }
    const { container } = render(<Image />);
    expect(container.querySelector("[data-keyword]")?.getAttribute("data-keyword-kind")).toBe(
      "legacy",
    );
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    box.setSelectionRange(4, 4);
    fireEvent.select(box);
    const card = await screen.findByRole("tooltip");
    expect(card.textContent).toContain("{{Slopify_Appearance}}");
    // Said once, in the lint's sentence that also says how to rename it.
    expect(card.textContent).toContain(
      "is the old name of {{Slopify_Appearance}}. It keeps working; use Update to new names",
    );
    expect(card.textContent?.match(/old name/g)).toHaveLength(1);
  });
});

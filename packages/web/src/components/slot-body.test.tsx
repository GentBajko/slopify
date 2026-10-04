import { lintPrompt } from "@app/slices/library/lint.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useId, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DetectedSlots, offsetOf } from "./detected-slots";
import { bodyLines, caretPosition, SlotBody } from "./slot-body";

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
  it("numbers each line and keeps the marks at their offsets", () => {
    const lines = bodyLines("One {{Topic}}\n\nThree {{ open");
    expect(lines.map((line) => line.number)).toEqual([1, 2, 3]);
    expect(lines[1]?.pieces).toEqual([]);
    expect(lines[2]?.pieces.find((piece) => piece.marked)?.start).toBe(21);
    expect(caretPosition("ab\ncd", 4)).toBe("Line 2, column 2");
  });

  it("counts against the 100,000 characters and says where the caret is", () => {
    render(<Editor start={"Hello\nworld"} />);
    expect(screen.getByText("11 of 100,000 characters")).not.toBeNull();
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    box.setSelectionRange(8, 8);
    fireEvent.select(box);
    expect(screen.getByText("Line 2, column 3")).not.toBeNull();
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

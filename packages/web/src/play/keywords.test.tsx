import type { Field } from "@app/slices/admission/substitute.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeywordBlock } from "@/play/keywords";

afterEach(cleanup);

const fields: readonly Field[] = [
  { name: "topic", group: "common" },
  { name: "minWords", group: "text" },
  { name: "maxWords", group: "text" },
  { name: "era", group: "image" },
];

function block(over: Partial<Parameters<typeof KeywordBlock>[0]> = {}) {
  return render(
    <KeywordBlock
      fields={fields}
      values={{}}
      problem={() => undefined}
      onChange={vi.fn()}
      {...over}
    />,
  );
}

function group(name: string): HTMLElement {
  const found = document.querySelector(`[data-keywords="${name}"]`);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${name} group is rendered`);
  }
  return found;
}

describe("the keyword block", () => {
  it("puts Common on top and Text beside Image underneath", () => {
    block();

    const headings = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    expect(headings).toEqual(["Common", "Text", "Image"]);

    // Common is its own full-width block; Text and Image are the two columns of the grid
    // beneath it, with the divider between them.
    expect(group("common").contains(screen.getByLabelText("topic"))).toBe(true);
    expect(group("text").contains(screen.getByLabelText("minWords"))).toBe(true);
    expect(group("image").contains(screen.getByLabelText("era"))).toBe(true);
    expect(group("sides").childElementCount).toBe(3);
  });

  it("draws nothing at all while no prompt is picked", () => {
    const { container } = block({ fields: [] });

    expect(container.textContent).toBe("");
  });

  it("drops the Common header when no name is used on both sides", () => {
    block({ fields: [{ name: "era", group: "image" }] });

    expect(screen.queryByRole("heading", { name: "Common" })).toBeNull();
    expect(screen.getByLabelText("era")).not.toBeNull();
  });

  it("keeps a field to one line of at most 200 characters", () => {
    block();

    const field = screen.getByLabelText("topic");
    expect(field instanceof HTMLInputElement).toBe(true);
    expect(field.getAttribute("maxlength")).toBe("200");
  });

  it("hands the typed value back under the slot's own name", async () => {
    const onChange = vi.fn();
    block({ onChange });

    await userEvent.type(screen.getByLabelText("era"), "x");

    expect(onChange).toHaveBeenCalledWith("era", "x");
  });

  it("marks the field the rule refused and says why beneath it", () => {
    block({
      problem: (field) => (field === "values.maxWords" ? "Fill maxWords to play" : undefined),
    });

    expect(screen.getByLabelText("maxWords").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("topic").getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByText("Fill maxWords to play")).not.toBeNull();
  });
});

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

describe("the keyword block", () => {
  it("shows each keyword once in a single labelled list", () => {
    block();
    expect(screen.getByRole("heading", { name: "Keywords" })).not.toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(screen.getAllByLabelText("topic")).toHaveLength(1);
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

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OptionPicker } from "./pickers";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() =>
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() }),
);
afterEach(cleanup);

it.each(["intro", "outro"] as const)(
  "restores an unavailable %s visibly and persists explicitly choosing Off",
  async (kind) => {
    const h = reviewHarness();
    const value = `Deleted ${kind}`;
    await h.prepare({
      ...suppliedDocument,
      form: {
        ...suppliedDocument.form,
        sources: { ...suppliedDocument.form.sources, audio: "generate" },
        [kind]: value,
      },
    });
    await act(async () => {
      await h.session().flush();
    });
    await h.restart();
    await waitFor(() => expect(h.session().document.form[kind]).toBe(value));
    await act(async () => {
      await h.session().navigate("outputs");
    });
    const label = kind === "intro" ? "Intro" : "Outro";
    const select = screen.getByLabelText(label) as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe(`${value} (saved choice)`);
    expect(select.value).toBe(value);
    await userEvent.selectOptions(select, "");
    expect(h.session().document.form[kind]).toBe("");
    await act(async () => {
      await h.session().flush();
    });
    await h.restart();
    const restored = (await screen.findByLabelText(label)) as HTMLSelectElement;
    expect(h.session().document.form[kind]).toBe("");
    expect(restored.selectedOptions[0]?.textContent).toBe("Off");
  },
);

it("keeps an absent choice visible while options load, then uses its resolved label", () => {
  const onPick = vi.fn();
  const props = {
    label: "Prompt",
    value: "saved-id",
    placeholder: "Pick a prompt",
    problem: undefined,
    onPick,
  };
  const mounted = render(<OptionPicker {...props} options={[]} />);
  const select = screen.getByLabelText("Prompt") as HTMLSelectElement;
  expect(select.selectedOptions[0]?.textContent).toBe("saved-id (saved choice)");
  mounted.rerender(
    <OptionPicker {...props} options={[{ value: "saved-id", label: "Resolved prompt" }]} />,
  );
  expect(select.selectedOptions[0]?.textContent).toBe("Resolved prompt");
  expect([...select.options].filter((option) => option.value === "saved-id")).toHaveLength(1);
  expect(onPick).not.toHaveBeenCalled();
});

it("allows replacing a missing choice and leaves an empty choice at its placeholder", async () => {
  const onPick = vi.fn();
  const props = {
    label: "Prompt",
    placeholder: "Pick a prompt",
    problem: undefined,
    onPick,
    options: [{ value: "new-id", label: "New prompt" }],
  };
  const mounted = render(<OptionPicker {...props} value="deleted-id" />);
  const select = screen.getByLabelText("Prompt") as HTMLSelectElement;
  expect(select.value).toBe("deleted-id");
  await userEvent.selectOptions(select, "new-id");
  expect(onPick).toHaveBeenCalledWith("new-id");
  mounted.rerender(<OptionPicker {...props} value="" />);
  expect(select.selectedOptions[0]?.textContent).toBe("Pick a prompt");
  expect([...select.options].some((option) => option.textContent?.includes("saved choice"))).toBe(
    false,
  );
});

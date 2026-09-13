import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { reviewHarness, reviewStorage } from "./review-test-harness";

beforeEach(() =>
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() }),
);
afterEach(cleanup);
it.each(["words", "characters"] as const)(
  "keeps a cleared %s count empty through save and restore",
  async (mode) => {
    const h = reviewHarness();
    await h.prepare({
      ...freshDraftDocument,
      form: { ...freshDraftDocument.form, chunking: { mode, words: "500", characters: "3000" } },
    });
    await act(async () => {
      await h.session().navigate("outputs");
    });
    await userEvent.click(screen.getByText(/Audio Advanced/));
    const label = mode === "words" ? "Words" : "Characters";
    fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    expect(h.session().document.form.chunking[mode]).toBe("");
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
    expect(document.body.textContent).not.toContain("NaN");
    await act(async () => {
      await h.session().flush();
    });
    await h.restart();
    await waitFor(() => expect(h.session().document.form.chunking[mode]).toBe(""));
    await act(async () => {
      await h.session().navigate("outputs");
    });
    await userEvent.click(screen.getByText(/Audio Advanced/));
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText(label), { target: { value: "777" } });
    expect(h.session().document.form.chunking[mode]).toBe("777");
  },
);

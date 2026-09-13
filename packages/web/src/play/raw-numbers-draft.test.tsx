import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { admissionOf, freshDraftDocument } from "./draft-state";
import { reviewHarness, reviewStorage } from "./review-test-harness";

beforeEach(() =>
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() }),
);
afterEach(cleanup);

it.each([
  ["images", "Number for Maps", "imagePrompts.0.number", ["", "-", "1.5", "21"]],
  ["words", "Words", "chunking.words", ["", "-", "1.5", "10001"]],
  ["characters", "Characters", "chunking.characters", ["", "1e", "1.5", "1000001"]],
] as const)(
  "preserves newly typed raw %s counts through save/reload and refuses them at Review",
  async (kind, label, field, values) => {
    const h = reviewHarness();
    await h.prepare({
      ...freshDraftDocument,
      form: {
        ...freshDraftDocument.form,
        imagePrompts: [{ name: "Maps", number: "1" }],
        chunking: { mode: kind === "images" ? "whole" : kind, words: "500", characters: "3000" },
      },
    });
    const raw = () =>
      kind === "images"
        ? h.session().document.form.imagePrompts[0]?.number
        : h.session().document.form.chunking[kind];
    const open = async () => {
      await act(async () => {
        await h.session().navigate("outputs");
      });
      if (kind !== "images") await userEvent.click(screen.getByText(/Audio Advanced/));
    };
    await open();
    for (const value of values) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      expect(raw()).toBe(value);
      await act(async () => {
        await h.session().flush();
      });
      await h.restart();
      await waitFor(() => expect(raw()).toBe(value));
      await open();
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(value);
      const review = admissionOf({
        document: h.session().document,
        attachments: [],
        entries: [],
        silenceGapSeconds: 0,
      });
      expect(review.ok).toBe(false);
      if (!review.ok) expect(review.fields.map((error) => error.field)).toContain(field);
    }
  },
);

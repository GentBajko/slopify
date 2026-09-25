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

it.each([
  ["imageSeconds", "Seconds per image", ["", "0", "1.5", "601"]],
  ["edgeSilenceSeconds", "Silence at start and end (seconds)", ["", "-1", "0.25", "31"]],
  ["zoomPercent", "Zoom (%)", ["", "-1", "10.25", "51"]],
] as const)(
  "keeps a typed %s through save/reload and refuses it at Review",
  async (field, label, values) => {
    const h = reviewHarness();
    await h.prepare(freshDraftDocument);
    const open = async () => {
      await act(async () => {
        await h.session().navigate("outputs");
      });
    };
    await open();
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(
      { imageSeconds: "15", edgeSilenceSeconds: "2", zoomPercent: "22.5" }[field],
    );
    for (const value of values) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      expect(h.session().document.form[field]).toBe(value);
      await act(async () => {
        await h.session().flush();
      });
      await h.restart();
      await waitFor(() => expect(h.session().document.form[field]).toBe(value));
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

it("offers seconds per image only for a video and the edge silence only with narration", async () => {
  const h = reviewHarness();
  await h.prepare({
    ...freshDraftDocument,
    form: {
      ...freshDraftDocument.form,
      sources: { ...freshDraftDocument.form.sources, images: "off", video: "off" },
    },
  });
  await act(async () => {
    await h.session().navigate("outputs");
  });
  expect(screen.queryByLabelText("Seconds per image")).toBeNull();
  expect(screen.queryByLabelText("Zoom (%)")).toBeNull();
  expect(screen.queryByLabelText("Motion")).toBeNull();
  expect(screen.getByLabelText("Silence at start and end (seconds)")).toBeDefined();
  expect(
    screen.getByRole("button", { name: "About silence at start and end (seconds)" }),
  ).toBeDefined();
});

it("offers the motion beside the zoom and keeps the pick through save/reload", async () => {
  const h = reviewHarness();
  await h.prepare(freshDraftDocument);
  const open = async () => {
    await act(async () => {
      await h.session().navigate("outputs");
    });
  };
  await open();
  const motion = screen.getByLabelText<HTMLSelectElement>("Motion");
  expect(motion.value).toBe("zoom");
  expect([...motion.options].map((option) => option.text)).toEqual([
    "Zoom in and out",
    "Pan across",
    "Mix of both",
    "Still",
  ]);
  expect(screen.getByRole("button", { name: "About motion" })).toBeDefined();
  fireEvent.change(motion, { target: { value: "pan" } });
  await waitFor(() => expect(h.session().document.form.motionStyle).toBe("pan"));
  await act(async () => {
    await h.session().flush();
  });
  await h.restart();
  await waitFor(() => expect(h.session().document.form.motionStyle).toBe("pan"));
  await open();
  expect(screen.getByLabelText<HTMLSelectElement>("Motion").value).toBe("pan");
});

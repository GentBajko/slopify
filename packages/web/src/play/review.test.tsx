import type { PlayReview } from "@app/slices/play-drafts/model.js";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deferred } from "./play-test-fixture";
import { sameReviewedGeneration } from "./review-state";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
describe("bound review identity", () => {
  it("invalidates a reviewed generation after any local edit", () => {
    const reviewed = { draftId: "draft", version: 3, editGeneration: 7 };
    expect(sameReviewedGeneration(reviewed, { ...reviewed, editGeneration: 8 })).toBe(false);
    expect(sameReviewedGeneration(reviewed, reviewed)).toBe(true);
  });
  it.each(["keyword", "expectedWords", "source", "template"] as const)(
    "rejects a held review after changing %s and sends only its fresh bound identity",
    async (field) => {
      const pending = deferred();
      let held: Response | undefined;
      const harness = reviewHarness(async (request, response) => {
        if (request.url.endsWith("/review") && !held) {
          held = response;
          return pending.promise;
        }
        return response;
      });
      await harness.prepare();
      await waitFor(() => expect(held).toBeDefined());
      await act(async () => {
        const document = harness.session().document;
        harness.session().edit(
          field === "expectedWords"
            ? { ...document, expectedWords: "2500" }
            : {
                ...document,
                form: {
                  ...document.form,
                  ...(field === "keyword"
                    ? { values: { topic: "new" } }
                    : field === "template"
                      ? { articlePrompt: "Dossier" }
                      : { sources: { ...document.form.sources, research: "provide" } }),
                },
              },
        );
        if (held) pending.resolve(held);
      });
      await waitFor(() => expect(harness.session().review.pending).toBe(false));
      expect(
        (screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      await userEvent.click(screen.getByRole("button", { name: "Refresh review" }));
      await waitFor(() => expect(harness.session().review.valid).toBe(true));
      const receipt = harness.session().review.receipt;
      await userEvent.click(screen.getByRole("button", { name: "Start run" }));
      await waitFor(() => expect(harness.created).toHaveBeenCalledTimes(1));
      const sent = harness.requests.find((request) => request.url.endsWith("/start"));
      expect(await sent?.json()).toEqual({
        baseVersion: receipt?.draftVersion,
        reviewId: receipt?.id,
      });
      expect(
        harness.requests.some(
          (request) => request.method === "POST" && /\/api\/projects/.test(request.url),
        ),
      ).toBe(false);
    },
  );
  it("invalidates on focus and requires another bound review", async () => {
    const harness = reviewHarness();
    await harness.prepare();
    await waitFor(() => expect(harness.session().review.valid).toBe(true));
    act(() => window.dispatchEvent(new Event("focus")));
    expect((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
  it("preserves all 49 stable variants and raw expected words through restart", async () => {
    const harness = reviewHarness();
    const variants = Array.from({ length: 49 }, (_, index) => ({
      id: crypto.randomUUID(),
      title: `Video ${index + 2}`,
      values: { topic: `Topic ${index + 2}`, dormant: "keep" },
    }));
    await harness.prepare({ ...suppliedDocument, variants, expectedWords: "" });
    await act(async () => {
      await harness.session().flush();
    });
    expect(harness.session().document.expectedWords).toBe("");
    await harness.restart();
    await waitFor(() => expect(harness.session().document.variants).toEqual(variants));
    expect(harness.session().document.expectedWords).toBe("");
    await userEvent.click(screen.getByText(/Queue keyword variations/));
    expect(
      (screen.getByRole("button", { name: "Add keyword variation" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

it("shows costs and resolved text from one receipt without treating unknown charges as zero", async () => {
  const harness = reviewHarness(async (request, response) => {
    if (!request.url.endsWith("/review")) return response;
    const review = (await response.json()) as PlayReview;
    return new Response(
      JSON.stringify({
        ...review,
        runs: review.runs.map((run) => ({
          ...run,
          rendered: { article: "The exact reviewed prompt." },
        })),
        estimates: [
          {
            currency: "USD",
            rows: [
              { stage: "Article", low: null, high: null, detail: "CLI account charge" },
              { stage: "Audio", low: 1.2, high: 2.4, detail: "Known provider rate" },
            ],
            low: 1.2,
            high: 2.4,
            unknown: 1,
            expectedWords: 1500,
            catalogueDate: "2026-09-13",
            assumptions: ["Actual usage may differ"],
          },
        ],
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  await harness.prepare({
    ...suppliedDocument,
    form: { ...suppliedDocument.form, values: { dormant: "Keep dormant" } },
  });
  await waitFor(() => expect(harness.session().review.valid).toBe(true));
  expect(screen.getByText("Known subtotal: $1.20 – $2.40")).not.toBeNull();
  expect(screen.getByText("Unknown")).not.toBeNull();
  expect(screen.getByText(/Plus 1 stage charge/)).not.toBeNull();
  expect(screen.getByText(/Catalogue verified 2026-09-13/)).not.toBeNull();
  expect(screen.getByText(/does not cap spending/)).not.toBeNull();
  expect(screen.queryByText("Keep dormant")).toBeNull();
  await userEvent.click(screen.getByText("Read the supplied article and resolved prompts"));
  expect(screen.getByText("The exact reviewed prompt.")).not.toBeNull();
  expect(screen.getByText("The supplied article.")).not.toBeNull();
  await userEvent.click(screen.getByText("Assumptions and stage details"));
  expect(screen.getByText("Actual usage may differ")).not.toBeNull();
});

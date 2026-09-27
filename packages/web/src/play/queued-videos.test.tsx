import type { PlayReview } from "@app/slices/play-drafts/model.js";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const variants = [
  { id: crypto.randomUUID(), title: "Lore 2", values: {} },
  { id: crypto.randomUUID(), title: "Lore 3", values: {} },
];

// The saved draft the review read had lost the page's keyword variations: the review
// answers with one video while the page still lists three.
async function oneVideoReview(response: Response): Promise<Response> {
  const review = (await response.json()) as PlayReview;
  return new Response(
    JSON.stringify({
      ...review,
      runs: review.runs.slice(0, 1),
      estimates: review.estimates.slice(0, 1),
    }),
    { status: response.status, headers: response.headers },
  );
}

it("never offers to queue more videos than the reviewed draft will start", async () => {
  let shrink = true;
  const harness = reviewHarness(async (request, response) => {
    if (request.url.endsWith("/review") && shrink) {
      shrink = false;
      return oneVideoReview(response);
    }
    return response;
  });
  await harness.prepare({ ...suppliedDocument, variants });
  await waitFor(() => expect(harness.session().review.pending).toBe(false));

  // The page shows three videos; the review covers one. Start must not be offered for it.
  expect(harness.session().review.valid).toBe(false);
  expect(screen.queryByRole("button", { name: "Start run" })).toBeNull();
  const queue = screen.getByRole("button", { name: "Queue 3 videos" }) as HTMLButtonElement;
  expect(queue.disabled).toBe(true);
  expect(screen.getByRole("alert").textContent).toMatch(
    /saved draft has 1 video, but this page shows 3/,
  );

  // The page is saved again with its three videos; the next review covers all of them.
  await waitFor(() => expect(harness.session().status).toBe("saved"));
  const firstReview = harness.requests.findIndex((request) => request.url.endsWith("/review"));
  const saves = harness.requests.slice(firstReview).filter((request) => request.method === "PUT");
  expect(saves).toHaveLength(1);
  const last = (await saves.at(-1)?.clone().json()) as {
    document: { variants: readonly unknown[] };
  };
  expect(last.document.variants).toHaveLength(2);
  await userEvent.click(screen.getByRole("button", { name: "Refresh review" }));
  await waitFor(() => expect(harness.session().review.valid).toBe(true));
  const receipt = harness.session().review.receipt;
  expect(receipt?.runs).toHaveLength(3);
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name: "Queue 3 videos" }));
  });
  await waitFor(() => expect(harness.created).toHaveBeenCalledTimes(1));
  const started = harness.requests.find((request) => request.url.endsWith("/start"));
  expect(await started?.clone().json()).toEqual({
    baseVersion: receipt?.draftVersion,
    reviewId: receipt?.id,
  });
});

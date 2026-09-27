import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import type { Review } from "./review-api.js";
import { ReviewVerdict, reviewFor, useReviews } from "./review-verdict.js";

afterEach(cleanup);

const flagged: Review = {
  id: "v1",
  projectId: "p1",
  revisionId: "r1",
  itemKey: "thumbnail:image",
  stage: "thumbnail",
  itemFingerprint: "f",
  reviewFingerprint: "g",
  passed: false,
  reasons: ["The title can't be read at phone size."],
  outcome: "flagged",
  attempt: 3,
  action: null,
  actionAt: null,
  redoState: null,
  redoError: null,
  createdAt: "2026-09-27T10:00:00.000Z",
  current: true,
  outputId: "o1",
  verdicts: 3,
};

function Subject({ busy = false }: { readonly busy?: boolean }) {
  const reviews = useReviews("p1");
  return (
    <ReviewVerdict
      review={reviewFor(reviews, { itemKey: "thumbnail:image" })}
      projectId="p1"
      busy={busy}
    />
  );
}

it("shows a flagged verdict with its reasons, and overrules it", async () => {
  const posted: string[] = [];
  let reviews: readonly Review[] = [flagged];
  renderApp(
    <Subject />,
    testDeps({
      "GET /api/projects/p1/reviews": (request) => jsonAnswer({ reviews })(request),
      "POST /api/projects/p1/reviews/v1/overrule": (request) => {
        posted.push("overrule");
        reviews = [{ ...flagged, action: "overruled", actionAt: "now" }];
        return jsonAnswer({ review: reviews[0] })(request);
      },
    }),
  );
  expect(await screen.findByText("Flagged by review")).toBeTruthy();
  expect(screen.getByText("The title can't be read at phone size.")).toBeTruthy();
  expect(screen.getByText(/Kept after 3 tries/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Overrule" }));
  expect(await screen.findByText("Accepted by you")).toBeTruthy();
  expect(posted).toEqual(["overrule"]);
  expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
});

it("says why a Redo was refused, beside the verdict", async () => {
  renderApp(
    <Subject />,
    testDeps({
      "GET /api/projects/p1/reviews": jsonAnswer({ reviews: [flagged] }),
      "POST /api/projects/p1/reviews/v1/redo": problemAnswer(
        "This item, or work that depends on it, is still running.",
        409,
      ),
    }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Redo" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("still running"));
});

it("shows nothing for an item without a current verdict", async () => {
  const { container } = renderApp(
    <Subject />,
    testDeps({
      "GET /api/projects/p1/reviews": jsonAnswer({ reviews: [{ ...flagged, current: false }] }),
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(container.textContent).toBe("");
});

it("calls off a redo still waiting to start with Overrule, even while the project runs", async () => {
  const posted: string[] = [];
  let reviews: readonly Review[] = [{ ...flagged, outcome: "redo", redoState: "pending" }];
  renderApp(
    <Subject busy />,
    testDeps({
      "GET /api/projects/p1/reviews": (request) => jsonAnswer({ reviews })(request),
      "POST /api/projects/p1/reviews/v1/overrule": (request) => {
        posted.push("overrule");
        reviews = [{ ...flagged, action: "overruled", actionAt: "now" }];
        return jsonAnswer({ review: reviews[0] })(request);
      },
    }),
  );
  expect(await screen.findByText("Waiting to be made again")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Redo" }).hasAttribute("disabled")).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Overrule" }));
  expect(await screen.findByText("Accepted by you")).toBeTruthy();
  expect(posted).toEqual(["overrule"]);
});

it("keeps Overrule off once the redo has started", async () => {
  renderApp(
    <Subject />,
    testDeps({
      "GET /api/projects/p1/reviews": jsonAnswer({
        reviews: [{ ...flagged, outcome: "redo", redoState: "started" }],
      }),
    }),
  );
  expect(await screen.findByText("Being made again")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Overrule" }).hasAttribute("disabled")).toBe(true);
});

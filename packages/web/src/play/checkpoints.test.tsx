import type { PlayDraftDocument, PlayReview } from "@app/slices/play-drafts/model.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { openRow, topicLabel } from "./play-test-fixture";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() });
});
afterEach(cleanup);

const generated: PlayDraftDocument = {
  ...freshDraftDocument,
  form: { ...freshDraftDocument.form, title: "Review gates" },
};
const choices = [
  "Pause after the article (before the narration)",
  "Pause after the narration (before the images)",
  "Pause after the images (before the video)",
] as const;

it("selects each checkpoint and preserves it through saves, unrelated edits and reload", async () => {
  const h = reviewHarness();
  await h.prepare(generated);
  await openRow("Pauses and checks");
  for (const name of choices) await userEvent.click(screen.getByRole("checkbox", { name }));
  await act(() => h.session().navigate("content"));
  await userEvent.type(screen.getByLabelText(topicLabel), " changed");
  await act(() => h.session().flush());
  expect(h.session().view?.draft.document.form.checkpoints).toEqual(["audio", "images", "video"]);
  await act(() => h.restart());
  await waitFor(() => expect(h.session().status).toBe("saved"));
  await openRow("Pauses and checks");
  for (const name of choices)
    expect((screen.getByRole("checkbox", { name }) as HTMLInputElement).checked).toBe(true);
  expect(h.requests.some((r) => r.url.endsWith("/start") || r.url.endsWith("/approve"))).toBe(
    false,
  );
});

it("offers only the pauses this run can make, and names each for what it stops after", async () => {
  const h = reviewHarness();
  await h.prepare(suppliedDocument);
  await openRow("Pauses and checks");
  expect(screen.queryAllByRole("checkbox", { name: /^Pause after/ })).toEqual([]);
  expect(
    screen.getByText("The run waits under Home → Needs you until you approve."),
  ).not.toBeNull();
  await act(async () => {
    const current = h.session().document;
    h.session().edit({
      ...current,
      form: { ...current.form, sources: { ...current.form.sources, audio: "provide" } },
    });
  });
  expect(
    screen
      .getAllByRole("checkbox", { name: /^Pause after/ })
      .map((box) => box.parentElement?.textContent),
  ).toEqual(["Pause after the narration (before the sound file)"]);
});

it("lets users remove a saved checkpoint after its stage is disabled", async () => {
  const h = reviewHarness();
  await h.prepare({
    ...suppliedDocument,
    form: { ...suppliedDocument.form, checkpoints: ["audio"] },
  });
  await openRow("Pauses and checks");
  const kept = screen.getByRole("checkbox", { name: choices[0] });
  expect(screen.getByText(/This run makes no narration to pause before/)).not.toBeNull();
  await userEvent.click(kept);
  expect(h.session().document.form.checkpoints).toEqual([]);
  expect(screen.queryByRole("checkbox", { name: choices[0] })).toBeNull();
});

it("shows reviewed dependency closure and pending approval, then invalidates changed setup", async () => {
  const h = reviewHarness(async (request, response) => {
    if (!request.url.endsWith("/review") || !response.ok) return response;
    const body: PlayReview = await response.json();
    return Response.json({
      ...body,
      checkpointSet: [
        {
          runIndex: 0,
          checkpointId: "audio",
          stage: "audio",
          fingerprint: "reviewed",
          workKeys: ["audio:body", "export:video"],
          dependents: ["video"],
        },
      ],
    });
  });
  await h.prepare({ ...generated, form: { ...generated.form, checkpoints: ["audio"] } });
  const summary = await screen.findByRole("region", { name: "Pauses and checks summary" });
  await waitFor(() => expect(within(summary).getByText(/Also holds: Video/)).not.toBeNull());
  // Named as the row names it.
  expect(within(summary).getByText(`Run 1 · ${choices[0]}`)).not.toBeNull();
  expect(within(summary).getByText(/Approval required on the project page/)).not.toBeNull();
  await userEvent.click(within(summary).getByRole("button", { name: "Change pauses and checks" }));
  // The pauses open in their own row on the form, like every other part of the run.
  expect(h.session().section).toBe("content");
  await userEvent.click(screen.getByRole("checkbox", { name: choices[1] }));
  expect(h.session().review.valid).toBe(false);
});

it("says in the summary that a run with no pauses goes straight through", async () => {
  const h = reviewHarness();
  await h.prepare(generated);
  const summary = await screen.findByRole("region", { name: "Pauses and checks summary" });
  expect(within(summary).getByText("No pauses for your approval.")).not.toBeNull();
  expect(within(summary).queryByText(/checkpoint/i)).toBeNull();
});

it.each(["checkpoints.audio", "checkpoints.0"])(
  "focuses the exact checkpoint for %s",
  async (field) => {
    const h = reviewHarness(async (request, response) =>
      request.url.endsWith("/review")
        ? Response.json(
            {
              title: "Bad Request",
              status: 400,
              reason: "readiness",
              fields: [{ field, message: "Review the Audio checkpoint" }],
            },
            { status: 400 },
          )
        : response,
    );
    await h.prepare({ ...generated, form: { ...generated.form, checkpoints: ["audio"] } });
    await userEvent.click(
      await screen.findByRole("button", { name: /Review the Audio checkpoint/ }),
    );
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-play-field")).toBe("checkpoints.audio"),
    );
    expect(h.session().section).toBe("content");
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
  },
);

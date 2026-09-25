import type { PlayDraftDocument, PlayReview } from "@app/slices/play-drafts/model.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() });
});
afterEach(cleanup);

const generated: PlayDraftDocument = {
  ...freshDraftDocument,
  form: { ...freshDraftDocument.form, title: "Review gates" },
};
const choices = ["Before Audio", "Before Images", "Before Video / export"] as const;

it("selects each checkpoint and preserves it through saves, unrelated edits and reload", async () => {
  const h = reviewHarness();
  await h.prepare(generated);
  await act(() => h.session().navigate("review"));
  for (const name of choices) await userEvent.click(screen.getByRole("checkbox", { name }));
  await act(() => h.session().navigate("content"));
  await userEvent.type(screen.getByLabelText("Project title"), " changed");
  await act(() => h.session().flush());
  expect(h.session().view?.draft.document.form.checkpoints).toEqual(["audio", "images", "video"]);
  await act(() => h.restart());
  await waitFor(() => expect(h.session().status).toBe("saved"));
  await act(() => h.session().navigate("review"));
  for (const name of choices)
    expect((screen.getByRole("checkbox", { name }) as HTMLInputElement).checked).toBe(true);
  expect(h.requests.some((r) => r.url.endsWith("/start") || r.url.endsWith("/approve"))).toBe(
    false,
  );
});

it("disables unavailable generated stages and keeps audio-only export selectable", async () => {
  const h = reviewHarness();
  await h.prepare(suppliedDocument);
  await act(() => h.session().navigate("review"));
  for (const name of choices)
    expect((screen.getByRole("checkbox", { name }) as HTMLInputElement).disabled).toBe(true);
  await act(async () => {
    const current = h.session().document;
    h.session().edit({
      ...current,
      form: { ...current.form, sources: { ...current.form.sources, audio: "provide" } },
    });
  });
  expect(
    (screen.getByRole("checkbox", { name: "Before Audio" }) as HTMLInputElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("checkbox", { name: "Before Video / export" }) as HTMLInputElement).disabled,
  ).toBe(false);
});

it("lets users remove a saved checkpoint after its stage is disabled", async () => {
  const h = reviewHarness();
  await h.prepare({
    ...suppliedDocument,
    form: { ...suppliedDocument.form, checkpoints: ["audio"] },
  });
  await act(() => h.session().navigate("review"));
  await userEvent.click(screen.getByRole("checkbox", { name: "Before Audio" }));
  expect(h.session().document.form.checkpoints).toEqual([]);
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
  const summary = await screen.findByRole("region", { name: "Checkpoints summary" });
  await waitFor(() =>
    expect(within(summary).getByText(/Also holds: Video \/ export/)).not.toBeNull(),
  );
  expect(within(summary).getByText(/Approval required on the project page/)).not.toBeNull();
  await userEvent.click(within(summary).getByRole("button", { name: "Edit checkpoints" }));
  expect(h.session().section).toBe("review");
  await userEvent.click(screen.getByRole("checkbox", { name: "Before Images" }));
  expect(h.session().review.valid).toBe(false);
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
      await screen.findByRole("button", { name: "Review the Audio checkpoint" }),
    );
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-play-field")).toBe("checkpoints.audio"),
    );
    expect(h.session().section).toBe("review");
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
  },
);

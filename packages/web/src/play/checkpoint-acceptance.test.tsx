import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { makeKey, openRow } from "./play-test-fixture";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() =>
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: reviewStorage(),
  }),
);
afterEach(cleanup);

it("keeps checkpoint Save, Review, Start and project approval as separate actions", async () => {
  const h = reviewHarness();
  await h.prepare({
    ...suppliedDocument,
    form: {
      ...suppliedDocument.form,
      sources: {
        ...suppliedDocument.form.sources,
        audio: "generate",
        images: "generate",
        video: "generate",
      },
      audio: { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "v1" },
      images: { provider: "fal", model: "fal-ai/flux-2" },
      imagePrompts: [{ name: "Maps", number: "1" }],
      values: { era: "Ancient" },
    },
  });
  await openRow("Pauses and checks");
  for (const name of [
    "Pause after the article (before the narration)",
    "Pause after the narration (before the images)",
    "Pause after the images (before the video)",
  ])
    await userEvent.click(screen.getByRole("checkbox", { name }));
  await act(() => h.session().flush());
  expect(h.session().view?.draft.document.form.checkpoints).toEqual(["audio", "images", "video"]);
  expect(h.session().review.valid).toBe(false);
  expect(h.requests.filter((request) => request.url.endsWith("/start"))).toHaveLength(0);
  await act(() => h.restart());
  await waitFor(() => expect(h.session().status).toBe("saved"));
  await openRow("Pauses and checks");
  const images = "Pause after the narration (before the images)";
  await userEvent.click(screen.getByRole("checkbox", { name: images }));
  await userEvent.click(screen.getByRole("checkbox", { name: images }));
  // Changing a pause invalidates the estimate; opening the summary asks again.
  await act(() => h.session().navigate("outputs"));
  await act(() => h.session().navigate("review"));
  await waitFor(() => expect(h.session().review.valid).toBe(true));
  expect(h.session().review.receipt?.runs[0]?.draft.checkpoints).toEqual([
    "audio",
    "video",
    "images",
  ]);
  expect(h.requests.filter((request) => request.url.endsWith("/start"))).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: makeKey }));
  await waitFor(() => expect(h.created).toHaveBeenCalledTimes(1));
  expect(h.requests.filter((request) => request.url.endsWith("/start"))).toHaveLength(1);
  expect(h.requests.filter((request) => request.url.endsWith("/approve"))).toHaveLength(0);
});

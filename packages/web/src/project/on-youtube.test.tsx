import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { OnYoutube } from "./on-youtube.js";

afterEach(cleanup);

const video = {
  projectId: "p1",
  short: 1,
  videoId: "SoiEotWS3dA",
  recordedAt: "2026-10-04T00:48:00.000Z",
  uploadState: "done",
  abState: "none",
  finishState: "none",
  finishMessage: null,
  commentState: "none",
  commentMessage: null,
  abMessage: null,
  abAt: null,
  checks: null,
};

it("forgets a short deleted in Studio, so it can be uploaded again", async () => {
  const sent: unknown[] = [];
  renderApp(
    <OnYoutube projectId="p1" shorts={1} />,
    testDeps({
      "GET /api/studio/videos/p1": jsonAnswer({ videos: [video] }),
      "PUT /api/studio/videos/p1": async (request) => {
        sent.push(await request.json());
        return jsonAnswer({ videos: [] })(request);
      },
    }),
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Deleted on YouTube" }));
  await waitFor(() => expect(sent).toEqual([{ short: 1, link: "" }]));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Deleted on YouTube" })).toBeNull(),
  );
});

it("says whether A/B Testing was set up, and why it wasn't", async () => {
  renderApp(
    <OnYoutube projectId="p1" shorts={0} />,
    testDeps({
      "GET /api/studio/videos/p1": jsonAnswer({
        videos: [
          {
            ...video,
            short: null,
            abState: "failed",
            abMessage: "Studio's A/B Testing didn't open.",
          },
        ],
      }),
    }),
  );
  expect(
    await screen.findByText(/Setting up A\/B Testing failed: Studio's A\/B Testing didn't open\./),
  ).toBeTruthy();
  cleanup();
  renderApp(
    <OnYoutube projectId="p1" shorts={0} />,
    testDeps({
      "GET /api/studio/videos/p1": jsonAnswer({
        videos: [{ ...video, short: null, abState: "started" }],
      }),
    }),
  );
  expect(await screen.findByText(/A\/B Testing set up/)).toBeTruthy();
});

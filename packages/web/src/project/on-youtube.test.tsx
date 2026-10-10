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

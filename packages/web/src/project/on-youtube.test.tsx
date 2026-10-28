import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
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

function mount(
  shorts: number,
  routes: Readonly<Record<string, Answer>>,
  uploadedAt: string | null = null,
) {
  renderRouted(
    <OnYoutube projectId="p1" shorts={shorts} />,
    testDeps({
      "GET /api/projects": jsonAnswer({ projects: [{ id: "p1", uploadedAt }] }),
      "GET /api/projects/p1/youtube-edits": jsonAnswer({ fields: {}, links: [] }),
      ...routes,
    }),
  );
}

it("names each upload, says where it stands and keeps Save link in view", async () => {
  const sent: unknown[] = [];
  mount(1, {
    "GET /api/studio/videos/p1": jsonAnswer({ videos: [] }),
    "PUT /api/studio/videos/p1": async (request) => {
      sent.push(await request.json());
      return jsonAnswer({ videos: [{ ...video, short: null, videoId: "6tRcYUoxyQo" }] })(request);
    },
  });
  const box = await screen.findByRole("textbox", { name: "Video link" });
  // The Shorts section's "Add the link" goes to this box.
  expect(box.id).toBe("on-youtube-video");
  expect(screen.getByRole("textbox", { name: "Short 1 link" })).not.toBeNull();
  expect(screen.getAllByText("Not on YouTube yet")).toHaveLength(2);
  const saves = screen.getAllByRole("button", { name: "Save link" });
  expect(saves).toHaveLength(2);
  // An empty box says what to do instead of sending nothing.
  await userEvent.click(saves[0] ?? document.body);
  expect(screen.getByText("Paste the video's link from YouTube first.")).not.toBeNull();
  expect(sent).toEqual([]);
  // Nothing else is offered until a link exists.
  expect(screen.queryByText("Test other titles and thumbnails")).toBeNull();
  expect(screen.queryByText("Have the links filled in for you")).toBeNull();
  await userEvent.type(box, "https://youtu.be/6tRcYUoxyQo");
  await userEvent.click(saves[0] ?? document.body);
  await waitFor(() =>
    expect(sent).toEqual([{ short: null, link: "https://youtu.be/6tRcYUoxyQo" }]),
  );
  expect(await screen.findByText("Uploaded")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Forget this link" })).not.toBeNull();
  // Testing other titles and the extension wait in a fold named for them once a link exists.
  await userEvent.click(screen.getByText("Test other titles and thumbnails"));
  expect(screen.getByRole("button", { name: "Test titles and thumbnails" })).not.toBeNull();
  expect(
    screen.getByRole("link", { name: "Settings → YouTube Studio and posting" }),
  ).not.toBeNull();
});

it("forgets a short deleted in Studio, so it can be uploaded again, with Undo", async () => {
  const sent: unknown[] = [];
  mount(1, {
    "GET /api/studio/videos/p1": jsonAnswer({ videos: [video] }),
    "PUT /api/studio/videos/p1": async (request) => {
      const body = (await request.json()) as { link: string };
      sent.push(body);
      return jsonAnswer({ videos: body.link === "" ? [] : [video] })(request);
    },
  });
  const user = userEvent.setup();
  const forget = await screen.findByRole("button", { name: "Forget this link" });
  // A short's link alone offers the extension, in a fold named for it, but no title tests.
  expect(screen.getByText("Have the links filled in for you")).not.toBeNull();
  expect(screen.queryByText("Test other titles and thumbnails")).toBeNull();
  await user.click(forget);
  await waitFor(() => expect(sent).toEqual([{ short: 1, link: "" }]));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Forget this link" })).toBeNull(),
  );
  expect(await screen.findByText("Forgot Short 1's link.")).not.toBeNull();
  await user.click(await screen.findByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(sent).toEqual([
      { short: 1, link: "" },
      { short: 1, link: "https://youtu.be/SoiEotWS3dA" },
    ]),
  );
});

it("says a project marked uploaded without a link is up, and asks for its link", async () => {
  mount(0, { "GET /api/studio/videos/p1": jsonAnswer({ videos: [] }) }, "2026-10-04T00:48:00.000Z");
  expect(await screen.findByText("Uploaded")).not.toBeNull();
  expect(screen.getByText(/paste its link so the shorts can point to it/u)).not.toBeNull();
});

it("says whether A/B Testing was set up, and why it wasn't", async () => {
  mount(0, {
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
  });
  expect(
    await screen.findByText(/Setting up A\/B Testing failed: Studio's A\/B Testing didn't open\./),
  ).toBeTruthy();
  cleanup();
  mount(0, {
    "GET /api/studio/videos/p1": jsonAnswer({
      videos: [{ ...video, short: null, abState: "started" }],
    }),
  });
  expect(await screen.findByText(/A\/B Testing set up: once you press Set test/)).toBeTruthy();
});

it("saves this project's Previous episode with one Save and says what it fills", async () => {
  const sent: unknown[] = [];
  mount(0, {
    "GET /api/studio/videos/p1": jsonAnswer({ videos: [] }),
    "PUT /api/projects/p1/youtube-edits/links": async (request) => {
      sent.push(await request.json());
      return jsonAnswer({
        fields: {},
        links: [{ name: "Previous video", url: "https://youtu.be/old" }],
      })(request);
    },
  });
  const box = await screen.findByRole("textbox", { name: "Previous episode" });
  const row = box.closest("[data-help-scope]") as HTMLElement;
  // In words, not template braces: the person sees no {{Previous video}} anywhere else.
  expect(within(row).getByText(/where its template asks for the previous episode/u)).not.toBeNull();
  expect(row.textContent).not.toContain("{{");
  await waitFor(() =>
    expect(within(row).getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false),
  );
  await userEvent.click(within(row).getByRole("button", { name: "Save" }));
  expect(within(row).getByText("Paste a link first.")).not.toBeNull();
  await userEvent.type(box, "https://youtu.be/old");
  await userEvent.click(within(row).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(sent).toEqual([{ links: [{ name: "Previous video", url: "https://youtu.be/old" }] }]),
  );
});

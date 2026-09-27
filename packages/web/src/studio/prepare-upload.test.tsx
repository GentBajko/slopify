import type { UploadPack } from "@app/slices/studio/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { PrepareUpload } from "./prepare-upload.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const file = (asset: string, filename: string) => ({
  url: `/files/p1/${asset}`,
  asset,
  filename,
  contentType: "image/png",
  bytes: 3,
});
const pack: UploadPack = {
  projectId: "p1",
  projectTitle: "The Fox",
  missing: [],
  items: [
    {
      kind: "video",
      video: { ...file("video", "the-fox-video.mp4"), contentType: "video/mp4" },
      title: "The Fox",
      description: "A fox.\n\n0:00 Intro",
      tags: ["fox", "cliff"],
      thumbnails: [file("thumbnail", "the-fox-thumbnail.png"), file("thumbnail-2", "t2.png")],
      audience: "not_made_for_kids",
      playlist: "Fox tales",
    },
    {
      kind: "short",
      short: 1,
      video: null,
      title: "The jump",
      description: "Leap.",
      tags: ["fox"],
      thumbnails: [],
      audience: "not_made_for_kids",
      playlist: null,
    },
  ],
};

describe("Prepare upload", () => {
  it("lists Studio's steps in order and hands the chosen item to the extension", async () => {
    const user = userEvent.setup();
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    const chosen: unknown[] = [];
    renderApp(
      <PrepareUpload projectId="p1" ready />,
      testDeps({
        "GET /api/studio/packs/p1": jsonAnswer(pack),
        "POST /api/studio/packs/p1/choose": async (request) => {
          chosen.push(await request.json());
          return jsonAnswer({ chosen: { projectId: "p1", short: 1 } })(request);
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Prepare upload" }));
    const drawer = await screen.findByRole("dialog", { name: "Prepare upload" });
    await within(drawer).findByText("the-fox-video.mp4");
    const steps = within(drawer)
      .getAllByRole("checkbox")
      .map((box) => box.getAttribute("aria-label"));
    expect(steps).toEqual([
      "Video file done",
      "Title done",
      "Description done",
      "Thumbnail done",
      "Playlist done",
      "Audience done",
      "Tags (under Show more) done",
    ]);
    expect(within(drawer).getByText("Fox tales")).not.toBeNull();
    await user.click(within(drawer).getByRole("radio", { name: "Short 1" }));
    // A short has no thumbnail step.
    expect(
      within(drawer)
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-label")),
    ).not.toContain("Thumbnail done");
    await user.click(within(drawer).getByRole("button", { name: "Fill in YouTube Studio" }));
    expect(opened).toHaveBeenCalledWith("https://www.youtube.com/upload", "_blank", "noopener");
    await within(drawer).findByText(/Drop the video file/);
    expect(chosen).toEqual([{ short: 1 }]);
  });

  it("is disabled until the video is made", () => {
    renderApp(<PrepareUpload projectId="p1" ready={false} />, testDeps({}));
    expect(screen.getByRole("button", { name: "Prepare upload" }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});

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
      alteredContent: { altered: true, why: "Yes because its images are photorealistic." },
      playlist: "Fox tales",
      chapterNotice: 'Chapters adjusted for YouTube: moved the first, "Intro", from 0:04 to 0:00.',
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
      alteredContent: { altered: false, why: "This channel is set to Always No." },
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
      "AI use (under Show more) done",
      "Tags (under Show more) done",
    ]);
    expect(within(drawer).getByText("Fox tales")).not.toBeNull();
    expect(within(drawer).getByText("Yes")).not.toBeNull();
    expect(within(drawer).getByText("Yes because its images are photorealistic.")).not.toBeNull();
    expect(within(drawer).getByText(/moved the first, "Intro", from 0:04 to 0:00/)).not.toBeNull();
    // Each row carries its own small action: Copy for text, Download for files.
    expect(within(drawer).getByRole("button", { name: "Copy title" })).not.toBeNull();
    expect(
      within(drawer).getByRole("link", { name: "Download the-fox-video.mp4" }).getAttribute("href"),
    ).toBe("http://slopify.test/files/p1/video");
    // The thumbnails sit under the list, lettered for Test & compare.
    const thumbnails = within(drawer).getByRole("region", { name: "Thumbnails to upload" });
    expect(
      within(thumbnails)
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["Thumbnail A", "Thumbnail B"]);
    const short = within(drawer).getByRole("button", { name: "Short 1" });
    expect(short.getAttribute("aria-pressed")).toBe("false");
    await user.click(short);
    expect(short.getAttribute("aria-pressed")).toBe("true");
    // The short's own answer: its channel is set to Always No.
    expect(within(drawer).getByText("No")).not.toBeNull();
    expect(within(drawer).getByText("This channel is set to Always No.")).not.toBeNull();
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

  it("marks the uploaded clips as real footage from the AI use step", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    const withClips: UploadPack = { ...pack, footage: { clips: 2, real: false } };
    const marked: UploadPack = {
      ...pack,
      footage: { clips: 2, real: true },
      items: pack.items.map((one, index) =>
        index === 0
          ? { ...one, alteredContent: { altered: true, why: "Yes because the fog alters them." } }
          : one,
      ),
    };
    renderApp(
      <PrepareUpload projectId="p1" ready />,
      testDeps({
        "GET /api/studio/packs/p1": jsonAnswer(withClips),
        "PUT /api/studio/packs/p1/real-footage": async (request) => {
          sent.push(await request.json());
          return jsonAnswer(marked)(request);
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Prepare upload" }));
    const drawer = await screen.findByRole("dialog", { name: "Prepare upload" });
    const toggle = await within(drawer).findByRole("switch", {
      name: "The 2 uploaded clips are real footage (filmed, not made by AI)",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    await within(drawer).findByText("Yes because the fog alters them.");
    expect(sent).toEqual([{ realFootage: true }]);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    // A short shows new pictures, so it has no such switch.
    await user.click(within(drawer).getByRole("button", { name: "Short 1" }));
    expect(within(drawer).queryByRole("switch")).toBeNull();
  });

  it("is disabled until the video is made", () => {
    renderApp(<PrepareUpload projectId="p1" ready={false} />, testDeps({}));
    expect(screen.getByRole("button", { name: "Prepare upload" }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});

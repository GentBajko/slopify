import type { UploadPack } from "@app/slices/studio/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioSettingsBody } from "@/api";
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
  playlistChoices: [],
  items: [
    {
      kind: "video",
      video: { ...file("video", "the-fox-video.mp4"), contentType: "video/mp4" },
      title: "The Fox",
      titles: ["The Fox Who Ran", "Why the Fox Ran"],
      description: "A fox.\n\n0:00 Intro",
      tags: ["fox", "cliff"],
      thumbnails: [file("thumbnail", "the-fox-thumbnail.png"), file("thumbnail-2", "t2.png")],
      audience: "not_made_for_kids",
      alteredContent: { altered: true, why: "Yes because its images are photorealistic." },
      playlists: ["Fox tales"],
      playlist: "Fox tales",
      chapterNotice: 'Chapters adjusted for YouTube: moved the first, "Intro", from 0:04 to 0:00.',
    },
    {
      kind: "short",
      short: 1,
      video: null,
      title: "The jump",
      titles: [],
      description: "Leap.",
      tags: ["fox"],
      thumbnails: [],
      audience: "not_made_for_kids",
      alteredContent: { altered: false, why: "This channel is set to Always No." },
      playlists: [],
      playlist: null,
    },
  ],
};

const pairedSettings: StudioSettingsBody = {
  playlists: [],
  channelPlaylists: {},
  pairing: { token: "t".repeat(32), origin: "chrome-extension://abc", pairedAt: "2026-09-27" },
};
const unpairedSettings: StudioSettingsBody = {
  ...pairedSettings,
  pairing: { ...pairedSettings.pairing, origin: null, pairedAt: null },
};
const studioRoutes = (settings = pairedSettings, queue: unknown[] = []) => ({
  "GET /api/studio/settings": jsonAnswer(settings),
  "GET /api/studio/queue": jsonAnswer({ queue }),
});

describe("Prepare upload", () => {
  it("lists Studio's steps in order and hands the chosen item to the extension", async () => {
    const user = userEvent.setup();
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    const chosen: unknown[] = [];
    renderApp(
      <PrepareUpload projectId="p1" ready />,
      testDeps({
        ...studioRoutes(),
        "GET /api/studio/packs/p1": jsonAnswer(pack),
        "POST /api/studio/packs/p1/choose": async (request) => {
          chosen.push(await request.json());
          return jsonAnswer({
            chosen: { projectId: "p1", short: 1 },
            queue: [{ projectId: "p1", projectTitle: "The Fox", short: 1, at: "2026-09-27" }],
          })(request);
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Prepare upload" }));
    const drawer = await screen.findByRole("dialog", { name: "Prepare upload" });
    await within(drawer).findByText("the-fox-video.mp4");
    const all = within(drawer).getByRole("checkbox", { name: "Select all" });
    const boxes = within(drawer)
      .getAllByRole("checkbox")
      .filter((box) => box !== all);
    const steps = boxes.map((box) => box.getAttribute("aria-label"));
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
    // Select all ticks every step and clears them again.
    await user.click(all);
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    await user.click(all);
    expect(boxes.some((box) => (box as HTMLInputElement).checked)).toBe(false);
    expect(within(drawer).getByText("Fox tales")).not.toBeNull();
    expect(within(drawer).getByText("Yes")).not.toBeNull();
    expect(within(drawer).getByText("Yes because its images are photorealistic.")).not.toBeNull();
    expect(within(drawer).getByText(/moved the first, "Intro", from 0:04 to 0:00/)).not.toBeNull();
    // Each row carries its own small action: Copy for text, Download for files.
    expect(within(drawer).getByRole("button", { name: "Copy title" })).not.toBeNull();
    // The other titles for Studio's A/B Testing, with a Copy of their own.
    expect(within(drawer).getByText(/also "The Fox Who Ran" and "Why the Fox Ran"/)).not.toBeNull();
    expect(within(drawer).getByRole("button", { name: "Copy the other titles" })).not.toBeNull();
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
    await within(drawer).findByText(/puts the video into its upload dialog/);
    expect(chosen).toEqual([{ short: 1 }]);
  });

  it("ticks which of the channel's playlists this project goes into", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    const choices: UploadPack = {
      ...pack,
      playlistChoices: [
        { name: "Fox tales", chosen: true },
        { name: "Cliff series", chosen: false },
      ],
    };
    const both: UploadPack = {
      ...choices,
      playlistChoices: choices.playlistChoices.map((one) => ({ ...one, chosen: true })),
      items: pack.items.map((one) => ({
        ...one,
        playlists: ["Fox tales", "Cliff series"],
        playlist: "Fox tales",
      })),
    };
    renderApp(
      <PrepareUpload projectId="p1" ready />,
      testDeps({
        ...studioRoutes(),
        "GET /api/studio/packs/p1": jsonAnswer(choices),
        "PUT /api/studio/packs/p1/playlists": async (request) => {
          sent.push(await request.json());
          return jsonAnswer(both)(request);
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Prepare upload" }));
    const drawer = await screen.findByRole("dialog", { name: "Prepare upload" });
    const cliff = await within(drawer).findByRole<HTMLInputElement>("checkbox", {
      name: "Cliff series",
    });
    expect(cliff.checked).toBe(false);
    await user.click(cliff);
    await waitFor(() => expect(sent).toEqual([{ playlists: ["Fox tales", "Cliff series"] }]));
    await waitFor(() => expect(cliff.checked).toBe(true));
    await user.click(within(drawer).getByRole("button", { name: "Copy playlist" }));
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
        ...studioRoutes(),
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

  it("shows how to install and pair the extension when none is paired, instead of filling", async () => {
    const user = userEvent.setup();
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    renderApp(
      <PrepareUpload projectId="p1" ready />,
      testDeps({
        ...studioRoutes(unpairedSettings),
        "GET /api/studio/packs/p1": jsonAnswer(pack),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Prepare upload" }));
    const drawer = await screen.findByRole("dialog", { name: "Prepare upload" });
    await within(drawer).findByText("The Slopify Studio extension isn't paired.");
    const steps = within(drawer).getByRole("list", { name: "Install steps" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(drawer).getByRole("link", { name: "Download for Chrome" }).getAttribute("href"),
    ).toBe("http://slopify.test/api/studio/extension/chrome.zip");
    await user.click(within(drawer).getByRole("button", { name: "Firefox" }));
    expect(
      within(drawer).getByRole("link", { name: "Download for Firefox" }).getAttribute("href"),
    ).toBe("http://slopify.test/api/studio/extension/firefox.zip");
    // The copy steps stay: they are the upload pack without the extension.
    expect(within(drawer).getByRole("button", { name: "Copy title" })).not.toBeNull();
    expect(
      within(drawer).getByRole("link", { name: "Open YouTube Studio" }).getAttribute("href"),
    ).toBe("https://www.youtube.com/upload");
    const fill = within(drawer).getByRole("button", { name: "Fill in YouTube Studio" });
    expect(fill.getAttribute("aria-disabled") ?? fill.getAttribute("disabled")).not.toBeNull();
    await user.click(fill);
    expect(opened).not.toHaveBeenCalled();
  });

  it("lists what waits for Studio and removes an item", async () => {
    const user = userEvent.setup();
    const removed: unknown[] = [];
    const waiting = [
      { projectId: "p1", projectTitle: "The Fox", short: 1, at: "2026-09-27T10:00:00.000Z" },
      { projectId: "p2", projectTitle: "The Owl", short: null, at: "2026-09-27T10:01:00.000Z" },
    ];
    renderApp(
      <PrepareUpload projectId="p1" ready />,
      testDeps({
        ...studioRoutes(pairedSettings, waiting),
        "GET /api/studio/packs/p1": jsonAnswer(pack),
        "POST /api/studio/queue/remove": async (request) => {
          removed.push(await request.json());
          return jsonAnswer({ queue: waiting.slice(1) })(request);
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Prepare upload" }));
    const drawer = await screen.findByRole("dialog", { name: "Prepare upload" });
    const list = await within(drawer).findByRole("list", { name: "Waiting to be filled" });
    expect(within(list).getByText("The Fox · Short 1")).not.toBeNull();
    expect(within(list).getByText(/Next: filled in the next upload dialog/)).not.toBeNull();
    expect(within(list).getByText("The Owl · Video")).not.toBeNull();
    expect(within(drawer).queryByText("The Slopify Studio extension isn't paired.")).toBeNull();
    await user.click(
      within(list).getByRole("button", {
        name: "Remove The Fox short 1 from Waiting for Studio",
      }),
    );
    expect(removed).toEqual([{ projectId: "p1", short: 1 }]);
    await within(drawer).findByText("Next: filled in the next upload dialog you open in Studio.");
    expect(within(drawer).queryByText("The Fox · Short 1")).toBeNull();
  });

  it("is disabled until the video is made", () => {
    renderApp(<PrepareUpload projectId="p1" ready={false} />, testDeps({}));
    expect(screen.getByRole("button", { name: "Prepare upload" }).hasAttribute("disabled")).toBe(
      true,
    );
  });
});

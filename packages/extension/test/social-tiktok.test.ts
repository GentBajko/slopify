import { beforeEach, describe, expect, it } from "vitest";
import { RefusedClick } from "../src/social/guard.js";
import { tiktok } from "../src/social/sites/tiktok.js";
import {
  filesOf,
  flips,
  loadFixture,
  media,
  noWaits,
  on,
  pack,
  recordingPress,
  reveal,
  takesPaste,
  watchForbidden,
} from "./social-fixture.js";

const upload = new URL("https://www.tiktok.com/tiktokstudio/upload");
const forbidden = [
  '[data-e2e="post_video_button"]',
  '[data-e2e="discard_post_button"]',
  "#checks-on",
];
const short = () =>
  pack("tiktok", {
    media: [media("short", "short-1.mp4")],
    text: "The fox learns to fly over the cliffs of Cliffside. #fox",
  });

function openTikTok(): void {
  loadFixture("tiktok-upload.html");
  document.querySelector('input[type="file"]')?.addEventListener("change", () => {
    reveal("form", "#details");
    takesPaste(document.querySelector(".public-DraftEditor-content") as Element);
    on('.more-toggle [role="button"]', () => {
      const more = document.querySelector("#more") as HTMLElement;
      if (more.childElementCount === 0) reveal("advanced", more);
      more.hidden = false;
      for (const control of more.querySelectorAll('[role="switch"]')) flips(control);
    });
    on('input[name="postSchedule"][value="schedule"]', () => {
      if (document.querySelector(".scheduled-picker") === null) reveal("picker", "#picker-slot");
    });
  });
}

const run = (post = short()) => {
  const recorded = recordingPress(tiktok);
  return {
    ...recorded,
    report: tiktok.fill({
      doc: document,
      location: upload,
      pack: post,
      files: filesOf(post),
      waits: noWaits,
      press: recorded.press,
    }),
  };
};

describe("TikTok", () => {
  beforeEach(openTikTok);

  it("adds the short, replaces the file name with the post and switches the AI label on", async () => {
    const hits = watchForbidden(forbidden);
    const { report, pressed } = run();
    const done = await report;
    expect(done.filled).toBe(true);
    const input = document.querySelector('input[accept="video/*"]') as HTMLInputElement;
    expect(input.files?.[0]?.name).toBe("short-1.mp4");
    expect(document.querySelector(".public-DraftEditor-content")?.textContent).toBe(
      "The fox learns to fly over the cliffs of Cliffside. #fox",
    );
    expect(document.querySelector("#aigc-switch")?.getAttribute("aria-checked")).toBe("true");
    expect(pressed).toEqual(["Show more", ""]);
    expect(hits).toEqual([]);
  });

  it("picks Schedule and sets the date and time for a scheduled post", async () => {
    const hits = watchForbidden(forbidden);
    const at = new Date(2026, 9, 20, 20, 0).toISOString();
    const { report } = run({ ...short(), schedule: { mode: "native", at } });
    const done = await report;
    expect(done.filled && done.scheduled).toBe(true);
    expect((document.querySelector('input[value="schedule"]') as HTMLInputElement).checked).toBe(
      true,
    );
    const [clock, date] = [
      ...document.querySelectorAll(".scheduled-picker input"),
    ] as HTMLInputElement[];
    expect(clock?.value).toBe("20:00");
    expect(date?.value).toBe("2026-10-20");
    expect(hits).toEqual([]);
  });

  it("goes to the Photos tab for pictures", () => {
    const post = pack("tiktok");
    expect(tiktok.pageFor?.(post, upload)).toBe(
      "https://www.tiktok.com/tiktokstudio/upload?tab=photo",
    );
    expect(tiktok.pageFor?.(post, new URL(`${upload.toString()}?tab=photo`))).toBeNull();
    expect(tiktok.pageFor?.(short(), upload)).toBeNull();
  });

  it("fills nothing when the video input is gone", async () => {
    document.querySelector('input[type="file"]')?.remove();
    const { report } = run();
    const done = await report;
    expect(done.filled).toBe(false);
    if (!done.filled) expect(done.missing).toEqual(["the video input"]);
  });

  it("says so when a post has no media for TikTok", async () => {
    const { report } = run(pack("tiktok", { media: [] }));
    const done = await report;
    expect(done.filled).toBe(false);
    expect(done.notes[0]?.message).toContain("needs a video or pictures");
  });

  it("says the AI label wasn't found when Show more hides none", async () => {
    document
      .querySelector("template#advanced")
      ?.replaceWith(Object.assign(document.createElement("template"), { id: "advanced" }));
    const { report } = run();
    const done = await report;
    expect(done.filled).toBe(true);
    expect(
      done.notes.some((note) => note.message.includes("couldn't find TikTok's AI label")),
    ).toBe(true);
  });

  it("refuses Post, Discard and Turn on", () => {
    reveal("form", "#details");
    reveal("checks", "#modals");
    const { press } = recordingPress(tiktok);
    for (const selector of forbidden)
      expect(() => press(document.querySelector(selector) as Element)).toThrow(RefusedClick);
  });

  it("counts the move to the Content list as posted and finds the video on the profile", () => {
    expect(tiktok.published(document, upload)).toBeNull();
    expect(
      tiktok.published(document, new URL("https://www.tiktok.com/tiktokstudio/content")),
    ).toEqual({ state: "posted" });
    reveal("profile", "#root");
    expect(
      tiktok.findLink(document, new URL("https://www.tiktok.com/@me"), "The fox learns to fly"),
    ).toBe("https://www.tiktok.com/@me/video/7400000000000000002");
  });
});

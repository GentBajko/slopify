import { beforeEach, describe, expect, it } from "vitest";
import { RefusedClick } from "../src/social/guard.js";
import { linkedin } from "../src/social/sites/linkedin.js";
import {
  filesOf,
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

const share = new URL("https://www.linkedin.com/feed/?shareActive=true");
const forbidden = [".share-actions__primary-action"];

let scheduleNext: boolean;
function openLinkedIn(): void {
  loadFixture("linkedin-share.html");
  scheduleNext = false;
  takesPaste(document.querySelector(".ProseMirror") as Element);
  document.querySelector('#share input[type="file"]')?.addEventListener("change", () => {
    reveal("media-editor", "#dialogs");
    on("#media-editor button", (button) => {
      if (button.textContent === "Next") document.querySelector("div#media-editor")?.remove();
    });
  });
  on('button[aria-label="Schedule post"]', () => {
    reveal("schedule", "#dialogs");
    on("#schedule-step button", (button) => {
      if (button.textContent === "Next") scheduleNext = true;
    });
  });
}

const run = (post = pack("linkedin", { media: [media("video", "fox.mp4")], aiLabel: false })) => {
  const recorded = recordingPress(linkedin);
  return {
    ...recorded,
    report: linkedin.fill({
      doc: document,
      location: share,
      pack: post,
      files: filesOf(post),
      waits: noWaits,
      press: recorded.press,
    }),
  };
};

describe("LinkedIn", () => {
  beforeEach(openLinkedIn);

  it("adds the video through the share box's input, passes the media editor and types the post", async () => {
    const hits = watchForbidden(forbidden);
    const { report, pressed } = run();
    const done = await report;
    expect(done.filled).toBe(true);
    const input = document.querySelector('#share input[type="file"]') as HTMLInputElement;
    expect(input.files?.[0]?.name).toBe("fox.mp4");
    expect(document.querySelector("div#media-editor")).toBeNull();
    expect(pressed).toEqual(["Next"]);
    expect(document.querySelector(".ProseMirror")?.textContent).toBe(
      "The fox learns to fly over the cliffs of Cliffside.#fox #cliffs",
    );
    expect(hits).toEqual([]);
  });

  it("sets the schedule step's date and time and presses only its Next", async () => {
    const hits = watchForbidden(forbidden);
    const at = new Date(2026, 9, 20, 20, 0).toISOString();
    const { report } = run(pack("linkedin", { media: [], schedule: { mode: "native", at } }));
    const done = await report;
    expect(done.filled && done.scheduled).toBe(true);
    expect(scheduleNext).toBe(true);
    const date = (document.querySelector("#share-post__scheduled-date") as HTMLInputElement).value;
    expect(date.split("/").sort()).toEqual(["10", "20", "2026"]);
    expect((document.querySelector("#share-post__scheduled-time") as HTMLSelectElement).value).toBe(
      "8:00 PM",
    );
    expect(hits).toEqual([]);
  });

  it("says to add the media by hand when the share box has no file input", async () => {
    document.querySelector('#share input[type="file"]')?.remove();
    const { report } = run();
    const done = await report;
    expect(done.filled).toBe(true);
    expect(done.notes[0]).toMatchObject({ ok: false, copy: "fox.mp4" });
    expect(done.notes[0]?.message).toContain("Press Media and add fox.mp4 yourself");
  });

  it("fills nothing when the text box is gone", async () => {
    document.querySelector(".ProseMirror")?.remove();
    const { report } = run();
    const done = await report;
    expect(done.filled).toBe(false);
    if (!done.filled) expect(done.missing).toEqual(["the post's text box"]);
    const input = document.querySelector('#share input[type="file"]') as HTMLInputElement;
    expect(input.files?.length ?? 0).toBe(0);
  });

  it("refuses Post", () => {
    const { press } = recordingPress(linkedin);
    expect(() =>
      press(document.querySelector(".share-actions__primary-action") as Element),
    ).toThrow(RefusedClick);
  });

  it("reads the posted toast's View post and finds the post on the profile", () => {
    expect(linkedin.published(document, share)).toBeNull();
    reveal("success", "#feed");
    expect(linkedin.published(document, share)).toEqual({
      state: "posted",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7250000000000000001/",
    });
    reveal("profile", "#feed");
    expect(
      linkedin.findLink(
        document,
        new URL("https://www.linkedin.com/in/me/recent-activity/all/"),
        "The fox learns to fly",
      ),
    ).toBe("https://www.linkedin.com/feed/update/urn:li:activity:7250000000000000002/");
    expect(linkedin.isCompose(share)).toBe(true);
    expect(linkedin.isCompose(new URL("https://www.linkedin.com/feed/"))).toBe(false);
  });
});

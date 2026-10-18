import { beforeEach, describe, expect, it } from "vitest";
import { RefusedClick } from "../src/social/guard.js";
import { bluesky } from "../src/social/sites/bluesky.js";
import {
  filesOf,
  here,
  loadFixture,
  noWaits,
  on,
  pack,
  recordingPress,
  reveal,
  takesPaste,
  watchForbidden,
} from "./social-fixture.js";

let changes: number;
function openBluesky(withAlt = true): void {
  loadFixture("bluesky-compose.html");
  changes = 0;
  on('button[aria-label="Compose new post"]', () => {
    reveal("composer", "#portal");
    takesPaste(document.querySelector(".ProseMirror") as Element);
    document.querySelector('input[type="file"]')?.addEventListener("change", () => {
      changes++;
      if (withAlt) {
        reveal("alt", "#attached");
        reveal("alt", "#attached");
      }
    });
  });
}

describe("Bluesky", () => {
  beforeEach(() => openBluesky());

  it("opens the composer, types the post, adds the pictures and their alt text", async () => {
    const hits = watchForbidden(['[data-testid="composerPublishBtn"]']);
    const { press, pressed } = recordingPress(bluesky);
    const post = pack("bluesky");
    const report = await bluesky.fill({
      doc: document,
      location: here,
      pack: post,
      files: filesOf(post),
      waits: noWaits,
      press,
    });
    expect(report.filled).toBe(true);
    expect(pressed).toEqual(["Compose new post"]);
    expect(document.querySelector(".ProseMirror")?.textContent).toBe(
      "The fox learns to fly over the cliffs of Cliffside.#fox #cliffs",
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect([...(input.files ?? [])].map((one) => one.name)).toEqual(["one.png", "two.png"]);
    expect(changes).toBe(1);
    expect(
      [...document.querySelectorAll("textarea")].map((box) => (box as HTMLTextAreaElement).value),
    ).toEqual(["A fox on a cliff.", "The sea below."]);
    expect(hits).toEqual([]);
    if (report.filled) expect(report.scheduled).toBe(false);
  });

  it("says to add alt text by hand when no alt box appears", async () => {
    openBluesky(false);
    const { press } = recordingPress(bluesky);
    const post = pack("bluesky");
    const report = await bluesky.fill({
      doc: document,
      location: here,
      pack: post,
      files: filesOf(post),
      waits: noWaits,
      press,
    });
    expect(report.filled).toBe(true);
    const note = report.notes.find((one) => !one.ok);
    expect(note?.message).toContain("alt text");
    expect(note?.copy).toBe("A fox on a cliff.\nThe sea below.");
  });

  it("fills nothing and names what's missing when the composer has changed", async () => {
    // A composer without any file input on the page.
    document.querySelector("template#composer")?.remove();
    document
      .querySelector("#portal")
      ?.insertAdjacentHTML(
        "beforeend",
        '<div data-testid="composePostView"><div class="tiptap ProseMirror" contenteditable="true"></div></div>',
      );
    const { press } = recordingPress(bluesky);
    const post = pack("bluesky");
    const report = await bluesky.fill({
      doc: document,
      location: here,
      pack: post,
      files: filesOf(post),
      waits: noWaits,
      press,
    });
    expect(report.filled).toBe(false);
    if (!report.filled)
      expect(report.missing).toEqual(["the media input behind Add media to post"]);
    expect(document.querySelector(".ProseMirror")?.textContent).toBe("");
  });

  it("never presses Publish post", () => {
    reveal("composer", "#portal");
    const { press } = recordingPress(bluesky);
    expect(() =>
      press(document.querySelector('[data-testid="composerPublishBtn"]') as Element),
    ).toThrow(RefusedClick);
  });

  it("reads the published toast's link, and finds the post on the profile", () => {
    expect(bluesky.published(document, here)).toBeNull();
    reveal("toast");
    expect(bluesky.published(document, new URL("https://bsky.app/"))).toEqual({
      state: "posted",
      url: "https://bsky.app/profile/me.bsky.social/post/3kxyzabc",
    });
    reveal("profile", "#feed");
    expect(
      bluesky.findLink(
        document,
        new URL("https://bsky.app/profile/me.bsky.social"),
        "The fox learns to fly over the cliffs of",
      ),
    ).toBe("https://bsky.app/profile/me.bsky.social/post/3kbbbbbb");
  });

  it("is the post form on the home page only", () => {
    expect(bluesky.isCompose(new URL("https://bsky.app/"))).toBe(true);
    expect(bluesky.isCompose(new URL("https://bsky.app/profile/me"))).toBe(false);
  });
});

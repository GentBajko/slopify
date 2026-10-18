import { beforeEach, describe, expect, it } from "vitest";
import { RefusedClick } from "../src/social/guard.js";
import { instagram } from "../src/social/sites/instagram.js";
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

const home = new URL("https://www.instagram.com/");
const forbidden = ["#share", "#discard-button", "#close"];

// Plays Instagram's part: Create opens the dialog, the file moves it to Crop, each Next to the
// following step, Accessibility shows the alt boxes.
let crop: string | undefined;
function openInstagram(steps: readonly string[] = ["crop", "edit", "caption"]): void {
  loadFixture("instagram-create.html");
  crop = undefined;
  const step = (name: string) => {
    const holder = document.querySelector("#step") as HTMLElement;
    holder.replaceChildren();
    reveal(name, holder);
    on('#step [role="button"]', (button) => {
      if (button.textContent?.trim() !== "Next") return;
      const next = steps[steps.indexOf(name) + 1];
      if (next !== undefined) step(next);
    });
    if (name === "crop")
      on("#crop-button", () => {
        reveal("crop-choices", "#crop-menu");
        on('#crop-menu [role="button"]', (choice) => {
          crop = choice.textContent?.trim();
        });
      });
    if (name === "caption") {
      takesPaste(document.querySelector('[aria-label="Add a caption..."]') as Element);
      on("#accessibility", () => reveal("alts", "#alt-slot"));
    }
  };
  // The press lands on the link around the icon.
  on('a[role="link"]', (link) => {
    if (link.querySelector('svg[aria-label="New post"]') === null) return;
    reveal("dialog", "#portal");
    document
      .querySelector('input[type="file"]')
      ?.addEventListener("change", () => step(steps[0] ?? "crop"));
  });
}

const run = (post = pack("instagram")) => {
  const recorded = recordingPress(instagram);
  return {
    ...recorded,
    report: instagram.fill({
      doc: document,
      location: home,
      pack: post,
      files: filesOf(post),
      waits: noWaits,
      press: recorded.press,
    }),
  };
};

describe("Instagram", () => {
  beforeEach(() => openInstagram());

  it("creates the post: pictures, 4:5 crop, Next twice, caption, AI label and alt text", async () => {
    const hits = watchForbidden(forbidden);
    const { report, pressed } = run();
    const done = await report;
    expect(done.filled).toBe(true);
    expect(crop).toBe("4:5");
    expect(pressed.filter((label) => label === "Next")).toHaveLength(2);
    expect(document.querySelector('[aria-label="Add a caption..."]')?.textContent).toBe(
      "The fox learns to fly over the cliffs of Cliffside.#fox #cliffs",
    );
    expect((document.querySelector("#ai-switch") as HTMLInputElement).checked).toBe(true);
    expect(
      [...document.querySelectorAll('input[placeholder="Write alt text..."]')].map(
        (box) => (box as HTMLInputElement).value,
      ),
    ).toEqual(["A fox on a cliff.", "The sea below."]);
    expect(hits).toEqual([]);
    expect(done.notes.every((note) => note.ok)).toBe(true);
  });

  it("keeps a reel's original shape and leaves alt text to pictures", async () => {
    const { report } = run(
      pack("instagram", { media: [media("short", "short-1.mp4", { shape: "9:16" })] }),
    );
    const done = await report;
    expect(done.filled).toBe(true);
    expect(crop).toBe("Original");
    expect(document.querySelector('input[placeholder="Write alt text..."]')).toBeNull();
  });

  it("names Create when the sidebar has changed, and fills nothing", async () => {
    document.querySelector('svg[aria-label="New post"]')?.remove();
    const { report } = run();
    const done = await report;
    expect(done.filled).toBe(false);
    if (!done.filled) expect(done.missing).toEqual(['the sidebar\'s "Create" (New post)']);
  });

  it("stops with the caption to paste when the caption step never comes", async () => {
    openInstagram(["crop", "edit"]);
    const { report } = run();
    const done = await report;
    expect(done.filled).toBe(false);
    if (done.filled) return;
    expect(done.missing).toEqual(["the caption box"]);
    expect(done.notes.at(-1)?.copy).toContain("The fox learns to fly");
  });

  it("refuses Share, Discard and the dialog's close", () => {
    reveal("dialog", "#portal");
    reveal("caption", "#step");
    reveal("discard", "#portal");
    const { press } = recordingPress(instagram);
    expect(() => press(document.querySelector("#share") as Element)).toThrow(RefusedClick);
    expect(() => press(document.querySelector("#discard-button") as Element)).toThrow(RefusedClick);
    expect(() => press(document.querySelector("#close") as Element)).toThrow(RefusedClick);
  });

  it("sees the shared message and finds the post on the profile", () => {
    expect(instagram.published(document, home)).toBeNull();
    reveal("shared", "#portal");
    expect(instagram.published(document, home)).toEqual({ state: "posted" });
    reveal("profile", "#main");
    expect(
      instagram.findLink(document, new URL("https://www.instagram.com/me/"), "The fox learns"),
    ).toBe("https://www.instagram.com/me/p/BBB222/");
  });
});

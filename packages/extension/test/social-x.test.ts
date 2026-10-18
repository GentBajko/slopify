import { beforeEach, describe, expect, it } from "vitest";
import { RefusedClick } from "../src/social/guard.js";
import { x } from "../src/social/sites/x.js";
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

const compose = new URL("https://x.com/compose/post");
const forbidden = [
  '[data-testid="tweetButton"]',
  '[data-testid="app-bar-close"]',
  '[data-testid="unsentButton"]',
];

function options(select: string, values: readonly number[]): void {
  document.querySelector(select)?.replaceChildren(
    ...values.map((value) =>
      Object.assign(document.createElement("option"), {
        value: String(value),
        textContent: String(value),
      }),
    ),
  );
}
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, at) => from + at);

let confirmed: boolean;
function openX(withDisclosure = true): void {
  loadFixture("x-compose.html");
  confirmed = false;
  takesPaste(document.querySelector('[data-testid="tweetTextarea_0"]') as Element);
  on('[data-testid="scheduleOption"]', () => {
    reveal("schedule", "#layers");
    options("#SELECTOR_2", range(1, 31));
    options("#SELECTOR_4", range(1, 12));
    options("#SELECTOR_5", range(0, 59));
    on('[data-testid="scheduledConfirmationPrimaryAction"]', () => {
      confirmed = true;
      document.querySelector("#schedule-dialog")?.remove();
    });
  });
  if (withDisclosure)
    on('[data-testid="contentDisclosureButton"]', () => {
      reveal("disclosure", "#menus");
      for (const item of document.querySelectorAll('[role="menuitemcheckbox"]')) flips(item);
    });
}

const run = (post = pack("x")) => {
  const recorded = recordingPress(x);
  return {
    ...recorded,
    report: x.fill({
      doc: document,
      location: compose,
      pack: post,
      files: filesOf(post),
      waits: noWaits,
      press: recorded.press,
    }),
  };
};

describe("X", () => {
  beforeEach(() => openX());

  it("types the post, adds the media and switches the AI disclosure on", async () => {
    const hits = watchForbidden(forbidden);
    const { report, pressed } = run();
    const done = await report;
    expect(done.filled).toBe(true);
    expect(document.querySelector('[data-testid="tweetTextarea_0"]')?.textContent).toBe(
      "The fox learns to fly over the cliffs of Cliffside.#fox #cliffs",
    );
    const input = document.querySelector('[data-testid="fileInput"]') as HTMLInputElement;
    expect([...(input.files ?? [])].map((one) => one.name)).toEqual(["one.png", "two.png"]);
    expect(pressed).toEqual(["Content disclosure", "Made with AI", "Done"]);
    expect(
      [...document.querySelectorAll('[role="menuitemcheckbox"]')].map((item) =>
        item.getAttribute("aria-checked"),
      ),
    ).toEqual(["false", "true"]);
    expect(hits).toEqual([]);
  });

  it("sets X's scheduler to the release time and presses only its Confirm", async () => {
    const hits = watchForbidden(forbidden);
    const at = new Date(2026, 9, 20, 20, 5).toISOString();
    const { report, pressed } = run(pack("x", { schedule: { mode: "native", at } }));
    const done = await report;
    expect(done.filled && done.scheduled).toBe(true);
    expect(confirmed).toBe(true);
    expect(pressed).toContain("Schedule post");
    expect(pressed).toContain("Confirm");
    expect(hits).toEqual([]);
  });

  it("checks the pickers before Confirm: unknown dates leave the post to go now, with the time to set", async () => {
    // A year the picker doesn't offer.
    const at = new Date(2031, 0, 2, 9, 0).toISOString();
    const { report } = run(pack("x", { schedule: { mode: "native", at } }));
    const done = await report;
    expect(done.filled).toBe(true);
    if (!done.filled) return;
    expect(done.scheduled).toBe(false);
    expect(confirmed).toBe(false);
    expect(done.notes.at(-1)?.message).toContain("2 Jan 2031, 09:00");
  });

  it("leaves the schedule alone for a post that goes now", async () => {
    const { report, pressed } = run(pack("x", { schedule: { mode: "now", at: null } }));
    await report;
    expect(pressed).not.toContain("Schedule post");
  });

  it("says the AI disclosure wasn't found, and presses nothing else, when the menu has no AI choice", async () => {
    openX(false);
    on('[data-testid="contentDisclosureButton"]', () => {
      document
        .querySelector("#menus")
        ?.insertAdjacentHTML(
          "beforeend",
          '<div role="menu"><div role="menuitemcheckbox">Paid partnership</div></div>',
        );
    });
    const { report, pressed } = run();
    const done = await report;
    expect(done.filled).toBe(true);
    expect(pressed).toEqual(["Content disclosure"]);
    expect(done.notes.at(-1)?.message).toContain("couldn't find X's AI label");
  });

  it("skips the AI disclosure for a post without Slopify media", async () => {
    const { report, pressed } = run(pack("x", { media: [], aiLabel: false }));
    await report;
    expect(pressed).toEqual([]);
  });

  it("fills nothing when the media input is gone", async () => {
    document.querySelector('[data-testid="fileInput"]')?.remove();
    const { report } = run(pack("x", { media: [media("video", "fox.mp4")] }));
    const done = await report;
    expect(done.filled).toBe(false);
    if (!done.filled) expect(done.missing).toEqual(["the media input"]);
    expect(document.querySelector('[data-testid="tweetTextarea_0"]')?.textContent).toBe("");
  });

  it("refuses Post and the close button", () => {
    const { press } = recordingPress(x);
    for (const selector of forbidden)
      expect(() => press(document.querySelector(selector) as Element)).toThrow(RefusedClick);
  });

  it("reads the sent toast's link, a scheduled toast, and the post on the profile", () => {
    const site = new URL("https://x.com/compose/post");
    expect(x.published(document, site)).toBeNull();
    reveal("will-send", "#toasts");
    expect(x.published(document, site)).toEqual({ state: "scheduled" });
    document.querySelector("#toasts")?.replaceChildren();
    reveal("sent", "#toasts");
    expect(x.published(document, site)).toEqual({
      state: "posted",
      url: "https://x.com/me/status/1850000000000000001",
    });
    reveal("profile", "#toasts");
    expect(x.findLink(document, new URL("https://x.com/me"), "The fox learns to fly")).toBe(
      "https://x.com/me/status/222",
    );
    expect(x.isCompose(compose)).toBe(true);
    expect(x.isCompose(new URL("https://x.com/home"))).toBe(false);
  });
});

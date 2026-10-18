import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { pressFor, type Site, waitsOf } from "../src/social/site.js";
import type { PostMedia, PostPack, SocialPlatform } from "../src/social/types.js";

// What the site adapter tests share: the fixture pages (static markup, later steps in
// <template>s that the tests reveal the way the site's scripts would), a post pack, files, and a
// press that records every control pressed.

export function loadFixture(name: string): void {
  const html = readFileSync(join(import.meta.dirname, "fixtures", "social", name), "utf8");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
}

// Puts a template's content into `into` (appended), as the site would render it.
export function reveal(template: string, into: string | Element = document.body): void {
  const content = document.querySelector<HTMLTemplateElement>(`template#${template}`)?.content;
  if (content === undefined) throw new Error(`No template #${template}`);
  const target = typeof into === "string" ? document.querySelector(into) : into;
  target?.append(content.cloneNode(true));
}

// Makes a contenteditable take pasted text the way the sites' editors do: what's selected
// (the whole box, after select-all) is replaced.
export function takesPaste(box: Element): void {
  box.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
    box.replaceChildren(
      ...text
        .split("\n")
        .map((line) => Object.assign(document.createElement("p"), { textContent: line })),
    );
  });
}

// Wires an element's clicks to a handler, for every match present now.
export function on(selector: string, run: (element: Element) => void): void {
  for (const element of document.querySelectorAll(selector))
    element.addEventListener("click", () => run(element));
}

// A switch that flips aria-checked when clicked.
export function flips(control: Element): void {
  control.addEventListener("click", () => {
    if (control instanceof HTMLInputElement) return;
    control.setAttribute(
      "aria-checked",
      control.getAttribute("aria-checked") === "true" ? "false" : "true",
    );
  });
}

export const noWaits = waitsOf({
  sleep: () => new Promise((done) => setTimeout(done, 0)),
  timeoutMs: 300,
  uploadMs: 300,
});

export function file(name: string, type: string): File {
  return new File(["bytes"], name, { type });
}

export function media(
  kind: PostMedia["kind"],
  name: string,
  extra: Partial<PostMedia> = {},
): PostMedia {
  const video = kind === "video" || kind === "short";
  return {
    kind,
    file: name.replace(/\W/g, "-"),
    url: `/api/social/media/p1/${name}`,
    filename: name,
    contentType: video ? "video/mp4" : "image/png",
    bytes: 10,
    shape: video ? "original" : "4:5",
    ...extra,
  };
}

export function filesOf(pack: PostPack): File[] {
  return pack.media.map((one) => file(one.filename, one.contentType));
}

export function pack(platform: SocialPlatform, overrides: Partial<PostPack> = {}): PostPack {
  const text = "The fox learns to fly over the cliffs of Cliffside.\n\n#fox #cliffs";
  return {
    projectId: "p1",
    projectTitle: "The Fox of Cliffside",
    platform,
    item: 0,
    choice: { text: "summary", media: { pictures: 2 }, hashtags: 2, link: false },
    chosenHere: false,
    text,
    generated: text,
    edited: false,
    count: { used: text.length, max: 300, unit: "characters" },
    hashtags: ["fox", "cliffs"],
    link: null,
    media: [
      media("picture", "one.png", { alt: "A fox on a cliff." }),
      media("picture", "two.png", { alt: "The sea below." }),
    ],
    aiLabel: true,
    schedule: { mode: "now", at: null },
    composeUrl: "https://example.com/",
    warnings: [],
    status: { state: "filling", url: null, message: null, at: null, by: null },
    ...overrides,
  };
}

// The site's guarded press, recording what it pressed (by label) and what it refused.
export function recordingPress(site: Site) {
  const guarded = pressFor(site);
  const pressed: string[] = [];
  const refused: string[] = [];
  const press = vi.fn((element: Element) => {
    const label = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
    try {
      guarded(element);
      pressed.push(label);
    } catch (error) {
      refused.push(label);
      throw error;
    }
  });
  return { press, pressed, refused };
}

// Clicks on these never happen: a listener on the whole page records any, including on
// controls rendered later.
export function watchForbidden(selectors: readonly string[]): string[] {
  const hits: string[] = [];
  const listen = (event: Event) => {
    const target = event.target as Element | null;
    for (const selector of selectors) if (target?.closest(selector)) hits.push(selector);
  };
  document.addEventListener("click", listen, true);
  document.addEventListener("pointerdown", listen, true);
  return hits;
}

export const here = new URL("https://example.com/");

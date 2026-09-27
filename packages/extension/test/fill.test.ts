import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { click, fillStudio, RefusedClick } from "../src/fill.js";
import type { PackItem } from "../src/pack.js";

const fixture = readFileSync(join(import.meta.dirname, "fixtures", "studio-upload.html"), "utf8");

const item: PackItem = {
  kind: "video",
  video: null,
  title: "The Fox of Cliffside",
  description: "A fox learns to fly.\n\n0:00 Intro\n0:40 The Cliff\n\n#fox",
  tags: ["fox", "cliff diving"],
  thumbnails: [],
  audience: "not_made_for_kids",
  playlist: "Fox tales",
};
const png = (name: string) => new File(["png"], name, { type: "image/png" });
const noWait = { sleep: () => Promise.resolve(), timeoutMs: 300 };

// The fixture is static markup; this plays the part of Studio's scripts for what the filler
// clicks: Show more reveals Tags, the playlist list opens and closes, checkboxes and radios
// tick, Test & compare opens its dialog. Presses of Next, Back or Publish are recorded.
let pressed: string[];
function loadStudio(edit: (doc: Document) => void = () => {}): void {
  const parsed = new DOMParser().parseFromString(fixture, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  edit(document);
  pressed = [];
  const on = (selector: string, run: (element: Element) => void) => {
    for (const element of document.querySelectorAll(selector))
      element.addEventListener("click", () => run(element));
  };
  on("#toggle-button", () => document.querySelector("#advanced")?.removeAttribute("hidden"));
  on("ytcp-dropdown-trigger", () =>
    document.querySelector("ytcp-playlist-dialog")?.removeAttribute("hidden"),
  );
  on("ytcp-playlist-dialog .done-button", () =>
    document.querySelector("ytcp-playlist-dialog")?.setAttribute("hidden", ""),
  );
  on("ytcp-checkbox-lit", (box) =>
    box.setAttribute(
      "aria-checked",
      box.getAttribute("aria-checked") === "true" ? "false" : "true",
    ),
  );
  on("tp-yt-paper-radio-button", (radio) => {
    for (const other of document.querySelectorAll("tp-yt-paper-radio-button"))
      other.setAttribute("aria-checked", "false");
    radio.setAttribute("aria-checked", "true");
  });
  on("#test-and-compare-button", () =>
    document.querySelector("ytcp-thumbnails-test-and-compare-dialog")?.removeAttribute("hidden"),
  );
  on("#next-button, #back-button, #done-button", (button) => pressed.push(button.id));
}

const text = (selector: string) => (document.querySelector(selector)?.textContent ?? "").trim();

describe("filling Studio's upload dialog", () => {
  beforeEach(() => loadStudio());

  it("fills every field in Studio's order and never presses Next or Publish", async () => {
    const results = await fillStudio(
      document,
      { ...item, thumbnails: [] },
      [png("thumb.png")],
      noWait,
    );
    expect(results.map((result) => [result.field, result.ok])).toEqual([
      ["title", true],
      ["description", true],
      ["thumbnails", true],
      ["playlist", true],
      ["audience", true],
      ["tags", true],
    ]);
    expect(text("#title-textarea #textbox")).toBe("The Fox of Cliffside");
    expect(text("#description-textarea #textbox")).toBe(item.description);
    const thumbnail = document.querySelector<HTMLInputElement>("#file-loader");
    expect(thumbnail?.files?.[0]?.name).toBe("thumb.png");
    const rows = [...document.querySelectorAll("ytcp-checkbox-group")];
    expect(
      rows.map((row) => row.querySelector("ytcp-checkbox-lit")?.getAttribute("aria-checked")),
    ).toEqual(["false", "true"]);
    expect(document.querySelector("ytcp-playlist-dialog")?.hasAttribute("hidden")).toBe(true);
    expect(
      document.querySelector('[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]')?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(document.querySelector<HTMLInputElement>("#tags-container input")?.value).toBe(
      "fox, cliff diving,",
    );
    expect(pressed).toEqual([]);
  });

  it("puts three thumbnails into Test & compare when Studio offers it", async () => {
    const results = await fillStudio(
      document,
      item,
      [png("one.png"), png("two.png"), png("three.png")],
      noWait,
    );
    const thumbnails = results.find((result) => result.field === "thumbnails");
    expect(thumbnails).toMatchObject({ ok: true });
    expect(thumbnails?.message).toContain("Test & compare");
    const inputs = [
      ...document.querySelectorAll<HTMLInputElement>(
        "ytcp-thumbnails-test-and-compare-dialog input",
      ),
    ];
    expect(inputs.map((input) => input.files?.[0]?.name)).toEqual([
      "one.png",
      "two.png",
      "three.png",
    ]);
    expect(pressed).toEqual([]);
  });

  it("sets the first thumbnail and says so when Test & compare isn't there", async () => {
    loadStudio((doc) => doc.querySelector("#test-and-compare-button")?.remove());
    const results = await fillStudio(
      document,
      item,
      [png("one.png"), png("two.png"), png("three.png")],
      noWait,
    );
    expect(document.querySelector<HTMLInputElement>("#file-loader")?.files?.[0]?.name).toBe(
      "one.png",
    );
    expect(results.find((result) => result.field === "thumbnails")?.message).toContain(
      "add thumbnails 2 and 3 by hand",
    );
  });

  it("fails loudly per field, copying the text, and still fills the rest", async () => {
    loadStudio((doc) => doc.querySelector("#tags-container")?.remove());
    const results = await fillStudio(document, item, [], noWait);
    const tags = results.find((result) => result.field === "tags");
    expect(tags).toEqual({
      field: "tags",
      ok: false,
      message: "Couldn't find the Tags field — the text is copied, paste it by hand.",
      copy: "fox, cliff diving",
    });
    expect(results.find((result) => result.field === "title")?.ok).toBe(true);
    expect(results.find((result) => result.field === "audience")?.ok).toBe(true);
  });

  it("names a playlist Studio doesn't have", async () => {
    const results = await fillStudio(document, { ...item, playlist: "Owls" }, [], noWait);
    expect(results.find((result) => result.field === "playlist")).toMatchObject({
      ok: false,
      copy: "Owls",
    });
    expect(results.find((result) => result.field === "playlist")?.message).toContain('"Owls"');
  });

  it("finds the title by its aria-label when the id it had is gone", async () => {
    loadStudio((doc) => doc.querySelector("#title-textarea")?.removeAttribute("id"));
    const results = await fillStudio(document, item, [], noWait);
    expect(results.find((result) => result.field === "title")?.ok).toBe(true);
    expect(text('[aria-label^="Add a title"]')).toBe("The Fox of Cliffside");
  });

  it("refuses to press the upload's own Publish, Next or Back", () => {
    for (const id of ["#done-button", "#next-button", "#back-button"]) {
      const button = document.querySelector(id);
      if (button === null) throw new Error(`fixture lacks ${id}`);
      expect(() => click(button)).toThrow(RefusedClick);
    }
    expect(pressed).toEqual([]);
  });
});

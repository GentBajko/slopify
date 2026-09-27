import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, type FieldResult, fillStudio, RefusedClick, setEditableText } from "../src/fill.js";
import { type PackItem, packText } from "../src/pack.js";
import * as selectors from "../src/selectors.js";

const fixture = readFileSync(join(import.meta.dirname, "fixtures", "studio-upload.html"), "utf8");

const item: PackItem = {
  kind: "video",
  video: null,
  title: "The Fox of Cliffside",
  description: "A fox learns to fly.\n\n0:00 Intro\n0:40 The Cliff\n\n#fox",
  tags: ["fox", "cliff diving"],
  thumbnails: [],
  audience: "not_made_for_kids",
  alteredContent: { altered: true, why: "Yes because its images are photorealistic." },
  playlist: "Fox tales",
};
const png = (name: string) => new File(["png"], name, { type: "image/png" });
const noWait = { sleep: () => Promise.resolve(), timeoutMs: 300 };

// Fills and expects every field the item needs to be there; answers each field's result.
async function fillFields(...args: Parameters<typeof fillStudio>): Promise<readonly FieldResult[]> {
  const report = await fillStudio(...args);
  if (!report.filled) throw new Error(`Nothing filled; missing ${report.missing.join(", ")}`);
  return report.results;
}

// The fixture is static markup; this plays the part of Studio's scripts for what the filler
// clicks: Show more reveals AI use and Tags and flips its label, the playlist list opens and
// closes, checkboxes tick, radios take `iron-selected` and `checked`, typing a tag then Enter
// (or a comma) makes a chip, A/B Testing opens its dialog. Presses of Next, Back or Publish are
// recorded.
let pressed: string[];
function loadStudio(
  edit: (doc: Document) => void = () => {},
  chipKeys: readonly string[] = ["Enter", ","],
): void {
  const parsed = new DOMParser().parseFromString(fixture, "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  edit(document);
  pressed = [];
  const on = (selector: string, run: (element: Element) => void) => {
    for (const element of document.querySelectorAll(selector))
      element.addEventListener("click", () => run(element));
  };
  on("#toggle-button", (toggle) => {
    const advanced = document.querySelector("#advanced");
    const opening = advanced?.hasAttribute("hidden") === true;
    advanced?.toggleAttribute("hidden", !opening);
    toggle.setAttribute(
      "aria-label",
      opening ? "Hide advanced settings" : "Show advanced settings",
    );
  });
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
  // A radio unselects the others of its own group only.
  on("tp-yt-paper-radio-button", (radio) => {
    for (const other of radio.parentElement?.querySelectorAll("tp-yt-paper-radio-button") ?? []) {
      other.classList.remove("iron-selected");
      other.removeAttribute("checked");
    }
    radio.classList.add("iron-selected");
    radio.setAttribute("checked", "");
  });
  on("#ab-test-button", () =>
    document.querySelector("ytcp-ab-test-dialog")?.removeAttribute("hidden"),
  );
  on("#next-button, #back-button, #done-button", (button) => pressed.push(button.id));
  const input = document.querySelector<HTMLInputElement>("#chip-bar #text-input");
  input?.addEventListener("keydown", (event) => {
    if (!chipKeys.includes(event.key)) return;
    const typed = input.value.replace(/,$/, "").trim();
    if (typed === "") return;
    const chip = document.createElement("ytcp-chip");
    chip.textContent = typed;
    document.querySelector("#chip-list")?.append(chip);
    input.value = "";
  });
}

const text = (selector: string) => (document.querySelector(selector)?.textContent ?? "").trim();
const selected = (name: string) =>
  document.querySelector(`[name="${name}"]`)?.classList.contains("iron-selected") ?? false;
const chips = () =>
  [...document.querySelectorAll("#chip-list ytcp-chip")].map((chip) => chip.textContent);
// Nothing the filler writes has been written: the title Studio put in (when the box is there),
// an empty description, no thumbnail, no ticked playlist, no chosen radio, no tag chips.
const untouched = () =>
  ["", "my-video-file"].includes(text("#title-textarea #textbox")) &&
  text("#description-textarea #textbox") === "" &&
  (document.querySelector<HTMLInputElement>("#file-loader")?.files?.length ?? 0) === 0 &&
  document.querySelector('ytcp-checkbox-lit[aria-checked="true"]') === null &&
  document.querySelector("tp-yt-paper-radio-button.iron-selected") === null &&
  chips().length === 0;

describe("filling Studio's upload dialog", () => {
  beforeEach(() => loadStudio());

  it("fills every field in Studio's order and never presses Next or Publish", async () => {
    const results = await fillFields(document, item, [png("thumb.png")], noWait);
    expect(results.map((result) => [result.field, result.ok])).toEqual([
      ["title", true],
      ["description", true],
      ["thumbnails", true],
      ["playlist", true],
      ["audience", true],
      ["altered", true],
      ["tags", true],
    ]);
    expect(text("#title-textarea #textbox")).toBe("The Fox of Cliffside");
    const thumbnail = document.querySelector<HTMLInputElement>("#file-loader");
    expect(thumbnail?.files?.[0]?.name).toBe("thumb.png");
    const rows = [...document.querySelectorAll("ytcp-checkbox-group")];
    expect(
      rows.map((row) => row.querySelector("ytcp-checkbox-lit")?.getAttribute("aria-checked")),
    ).toEqual(["false", "true"]);
    expect(document.querySelector("ytcp-playlist-dialog")?.hasAttribute("hidden")).toBe(true);
    expect(selected("VIDEO_MADE_FOR_KIDS_NOT_MFK")).toBe(true);
    expect(selected("VIDEO_HAS_ALTERED_CONTENT_YES")).toBe(true);
    expect(selected("VIDEO_HAS_ALTERED_CONTENT_NO")).toBe(false);
    // One chip per tag, and the input left empty.
    expect(chips()).toEqual(["fox", "cliff diving"]);
    expect(document.querySelector<HTMLInputElement>("#text-input")?.value).toBe("");
    // Answering AI use left the audience answer alone, and Show more open for Tags.
    expect(selected("VIDEO_MADE_FOR_KIDS_NOT_MFK")).toBe(true);
    expect(document.querySelector("#advanced")?.hasAttribute("hidden")).toBe(false);
    expect(pressed).toEqual([]);
  });

  it("keeps the description's line breaks as real line breaks", async () => {
    await fillFields(document, item, [], noWait);
    const box = document.querySelector("#description-textarea #textbox");
    expect(box?.innerHTML).toBe(
      "A fox learns to fly.<br><br>0:00 Intro<br>0:40 The Cliff<br><br>#fox",
    );
  });

  it("types through the editor's own insertText and insertLineBreak where the page has them", () => {
    const box = document.querySelector<HTMLElement>("#description-textarea #textbox");
    if (box === null) throw new Error("fixture lacks the description");
    const commands: string[] = [];
    const exec = vi.fn((command: string, _ui?: boolean, value?: string) => {
      commands.push(value === undefined ? command : `${command}:${value}`);
      if (command === "insertText") box.append(document.createTextNode(value ?? ""));
      if (command === "insertLineBreak") box.append(document.createElement("br"));
      return true;
    });
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
    const inputs: Event[] = [];
    box.addEventListener("input", (event) => inputs.push(event));
    try {
      setEditableText(box, "One\nTwo");
    } finally {
      Reflect.deleteProperty(document, "execCommand");
    }
    expect(commands).toEqual(["insertText:One", "insertLineBreak", "insertText:Two"]);
    // The editor's own commands send the input events; nothing is set behind its back.
    expect(inputs).toEqual([]);
    expect(box.innerHTML).toBe("One<br>Two");
  });

  it("presses Show more only once, and not when the advanced settings already show", async () => {
    loadStudio((doc) => {
      doc.querySelector("#advanced")?.removeAttribute("hidden");
      doc.querySelector("#toggle-button")?.setAttribute("aria-label", "Hide advanced settings");
    });
    const results = await fillFields(document, item, [], noWait);
    expect(results.find((result) => result.field === "altered")?.ok).toBe(true);
    expect(document.querySelector("#advanced")?.hasAttribute("hidden")).toBe(false);
  });

  it("ends each tag with a comma when Studio makes chips on commas only", async () => {
    loadStudio(undefined, [","]);
    const results = await fillFields(document, item, [], noWait);
    expect(results.find((result) => result.field === "tags")?.ok).toBe(true);
    expect(chips()).toEqual(["fox", "cliff diving"]);
  });

  it("skips tags already in the chip bar", async () => {
    loadStudio((doc) => {
      const chip = doc.createElement("ytcp-chip");
      chip.textContent = "fox";
      doc.querySelector("#chip-list")?.append(chip);
    });
    await fillFields(document, item, [], noWait);
    expect(chips()).toEqual(["fox", "cliff diving"]);
  });

  it("copies the tags Studio wouldn't turn into chips", async () => {
    loadStudio(undefined, []);
    const results = await fillFields(document, item, [], noWait);
    expect(results.find((result) => result.field === "tags")).toMatchObject({
      ok: false,
      copy: "fox, cliff diving",
    });
  });

  it('answers "No" to AI use when the pack says so, and never presses Publish', async () => {
    const results = await fillFields(
      document,
      { ...item, alteredContent: { altered: false, why: "No because none of it applies." } },
      [],
      noWait,
    );
    expect(results.find((result) => result.field === "altered")).toEqual({
      field: "altered",
      ok: true,
      message: 'AI use set to "No". No because none of it applies.',
    });
    expect(selected("VIDEO_HAS_ALTERED_CONTENT_NO")).toBe(true);
    expect(selected("VIDEO_HAS_ALTERED_CONTENT_YES")).toBe(false);
    expect(results.find((result) => result.field === "tags")?.ok).toBe(true);
    expect(pressed).toEqual([]);
  });

  it("finds the AI use answer by its aria-label when the name is gone", async () => {
    loadStudio((doc) =>
      doc.querySelector('[name="VIDEO_HAS_ALTERED_CONTENT_YES"]')?.removeAttribute("name"),
    );
    const results = await fillFields(document, item, [], noWait);
    expect(results.find((result) => result.field === "altered")?.ok).toBe(true);
    expect(
      document
        .querySelector('[aria-label="Yes, AI was used"]')
        ?.classList.contains("iron-selected"),
    ).toBe(true);
  });

  it("fills nothing when the AI use question isn't there, and says so", async () => {
    loadStudio((doc) => doc.querySelector("#altered-content")?.remove());
    const report = await fillStudio(document, item, [], noWait);
    expect(report).toEqual({ filled: false, missing: ['the "Yes" answer to AI use'] });
    expect(untouched()).toBe(true);
    expect(pressed).toEqual([]);
  });

  it("leaves AI use alone for a pack from an older Slopify", async () => {
    const { alteredContent: _dropped, ...older } = item;
    const results = await fillFields(document, older, [], noWait);
    expect(results.some((result) => result.field === "altered")).toBe(false);
    expect(selected("VIDEO_HAS_ALTERED_CONTENT_YES")).toBe(false);
    expect(selected("VIDEO_HAS_ALTERED_CONTENT_NO")).toBe(false);
  });

  it("puts three thumbnails into A/B Testing when Studio offers it", async () => {
    const results = await fillFields(
      document,
      item,
      [png("one.png"), png("two.png"), png("three.png")],
      noWait,
    );
    const thumbnails = results.find((result) => result.field === "thumbnails");
    expect(thumbnails).toMatchObject({ ok: true });
    expect(thumbnails?.message).toContain("A/B Testing");
    const inputs = [...document.querySelectorAll<HTMLInputElement>("ytcp-ab-test-dialog input")];
    expect(inputs.map((input) => input.files?.[0]?.name)).toEqual([
      "one.png",
      "two.png",
      "three.png",
    ]);
    expect(pressed).toEqual([]);
  });

  it("sets the first thumbnail and says so when A/B Testing isn't there", async () => {
    loadStudio((doc) => {
      doc.querySelector("#ab-test-button")?.remove();
      doc.querySelector("#preview-button")?.remove();
    });
    const results = await fillFields(
      document,
      item,
      [png("one.png"), png("two.png"), png("three.png")],
      noWait,
    );
    expect(document.querySelector<HTMLInputElement>("#file-loader")?.files?.[0]?.name).toBe(
      "one.png",
    );
    const message = results.find((result) => result.field === "thumbnails")?.message;
    expect(message).toContain("A/B Testing button wasn't found");
    expect(message).toContain("add thumbnails 2 and 3 by hand");
  });

  it("sets the first thumbnail when A/B Testing opens something it can't fill", async () => {
    loadStudio((doc) => doc.querySelector("ytcp-ab-test-dialog")?.replaceChildren());
    const results = await fillFields(document, item, [png("one.png"), png("two.png")], noWait);
    expect(document.querySelector<HTMLInputElement>("#file-loader")?.files?.[0]?.name).toBe(
      "one.png",
    );
    expect(results.find((result) => result.field === "thumbnails")?.message).toContain(
      "add thumbnail 2 there by hand",
    );
  });

  it("fills nothing when a field behind Show more is missing, and names it", async () => {
    loadStudio((doc) => doc.querySelector("#tags-container")?.remove());
    const report = await fillStudio(document, item, [png("thumb.png")], noWait);
    expect(report).toEqual({ filled: false, missing: ["the Tags field"] });
    expect(untouched()).toBe(true);
    expect(pressed).toEqual([]);
  });

  it("fills nothing when a field in the basics is missing, and names every missing one", async () => {
    loadStudio((doc) => {
      doc.querySelector("#title-textarea")?.remove();
      doc.querySelector("ytcp-video-metadata-playlists")?.remove();
      doc.querySelector("#altered-content")?.remove();
    });
    const report = await fillStudio(document, item, [png("thumb.png")], noWait);
    expect(report).toEqual({
      filled: false,
      missing: ["the Title field", "the Playlists field", 'the "Yes" answer to AI use'],
    });
    expect(untouched()).toBe(true);
    expect(pressed).toEqual([]);
  });

  it("only needs the fields the item uses", async () => {
    loadStudio((doc) => {
      doc.querySelector("ytcp-video-metadata-playlists")?.remove();
      doc.querySelector("ytcp-thumbnail-uploader")?.remove();
    });
    // No playlist and no thumbnail: neither field is needed.
    const results = await fillFields(document, { ...item, playlist: null }, [], noWait);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("still fails a field on its own when Studio won't take what was typed", async () => {
    loadStudio(undefined, []);
    const results = await fillFields(document, item, [], noWait);
    expect(results.find((result) => result.field === "tags")).toEqual({
      field: "tags",
      ok: false,
      message:
        "Couldn't add 2 of the tags — Studio didn't turn them into tags. The text is copied, paste it into Tags by hand.",
      copy: "fox, cliff diving",
    });
    expect(results.find((result) => result.field === "title")?.ok).toBe(true);
  });

  it("names a playlist Studio doesn't have, and closes the list", async () => {
    const results = await fillFields(document, { ...item, playlist: "Owls" }, [], noWait);
    expect(results.find((result) => result.field === "playlist")).toMatchObject({
      ok: false,
      copy: "Owls",
    });
    expect(results.find((result) => result.field === "playlist")?.message).toContain('"Owls"');
    expect(document.querySelector("ytcp-playlist-dialog")?.hasAttribute("hidden")).toBe(true);
  });

  it("finds the title by its aria-label when the id it had is gone", async () => {
    loadStudio((doc) => doc.querySelector("#title-textarea")?.removeAttribute("id"));
    const results = await fillFields(document, item, [], noWait);
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

// The fixture is hand-built, so this pins what it claims: the upload dialog's structure as
// `selectors.ts` describes it. Each Details field is found inside the dialog by its first
// selector (the one checked on the live Details editor), the dialog by every one of its
// selectors, and the footer's Next, Back and Publish sit inside it. The playlist list and the
// A/B Testing dialog are overlays outside it, and their selectors are guesses.
describe("the fixture's upload dialog", () => {
  beforeEach(() => loadStudio());
  const first = (field: selectors.FieldSelectors) => field.selectors[0] ?? "";

  it("is found by each of the dialog's selectors, as one element", () => {
    const found = selectors.uploadDialog.selectors.map((selector) =>
      document.querySelector(selector)?.closest("ytcp-uploads-dialog"),
    );
    expect(found.every((one) => one !== null && one !== undefined && one === found[0])).toBe(true);
  });

  it("holds every Details field at its first selector, inside the dialog", () => {
    const dialog = selectors.findField(document, selectors.uploadDialog);
    if (dialog === null) throw new Error("fixture lacks the upload dialog");
    const fields = [
      selectors.title,
      selectors.description,
      selectors.thumbnailInput,
      selectors.abTestButton,
      selectors.playlistTrigger,
      selectors.notForKids,
      selectors.showMore,
      selectors.alteredYes,
      selectors.alteredNo,
      selectors.tags,
    ];
    expect(
      fields.filter((field) => dialog.querySelector(first(field)) === null).map((f) => f.label),
    ).toEqual([]);
    // The fields behind Show more start hidden.
    for (const field of [selectors.alteredYes, selectors.tags])
      expect(dialog.querySelector(first(field))?.closest("[hidden]")).not.toBeNull();
    for (const id of selectors.forbidden.filter((one) => document.querySelector(one) !== null))
      expect(dialog.querySelector(id)).not.toBeNull();
    expect(
      ["#next-button", "#back-button", "#done-button"].map((id) => dialog.querySelector(id)),
    ).not.toContain(null);
  });

  it("keeps the playlist list and the A/B Testing dialog outside the upload dialog", () => {
    const dialog = selectors.findField(document, selectors.uploadDialog);
    for (const field of [selectors.playlistDialog, selectors.abTestInputs]) {
      const found = selectors.findField(document, field);
      expect(found).not.toBeNull();
      expect(dialog?.contains(found)).toBe(false);
    }
    const list = selectors.findField(document, selectors.playlistDialog);
    if (list === null) throw new Error("fixture lacks the playlist list");
    expect(selectors.findAll(list, selectors.playlistItems)).toHaveLength(2);
    expect(selectors.findField(list, selectors.playlistDone)).not.toBeNull();
  });
});

describe("the whole pack as text", () => {
  it("holds every part, for pasting by hand", () => {
    expect(packText(item)).toBe(
      [
        "Title:\nThe Fox of Cliffside",
        "Description:\nA fox learns to fly.\n\n0:00 Intro\n0:40 The Cliff\n\n#fox",
        "Tags:\nfox, cliff diving",
        "Playlist: Fox tales",
        "Audience: No, it's not made for kids",
        "AI use (under Show more): Yes. Yes because its images are photorealistic.\n",
      ].join("\n\n"),
    );
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

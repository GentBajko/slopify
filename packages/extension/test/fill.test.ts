import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, fillStudio, RefusedClick, setEditableText } from "../src/fill.js";
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
  alteredContent: { altered: true, why: "Yes because its images are photorealistic." },
  playlist: "Fox tales",
};
const png = (name: string) => new File(["png"], name, { type: "image/png" });
const noWait = { sleep: () => Promise.resolve(), timeoutMs: 300 };

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

describe("filling Studio's upload dialog", () => {
  beforeEach(() => loadStudio());

  it("fills every field in Studio's order and never presses Next or Publish", async () => {
    const results = await fillStudio(document, item, [png("thumb.png")], noWait);
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
    await fillStudio(document, item, [], noWait);
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
    const results = await fillStudio(document, item, [], noWait);
    expect(results.find((result) => result.field === "altered")?.ok).toBe(true);
    expect(document.querySelector("#advanced")?.hasAttribute("hidden")).toBe(false);
  });

  it("ends each tag with a comma when Studio makes chips on commas only", async () => {
    loadStudio(undefined, [","]);
    const results = await fillStudio(document, item, [], noWait);
    expect(results.find((result) => result.field === "tags")?.ok).toBe(true);
    expect(chips()).toEqual(["fox", "cliff diving"]);
  });

  it("skips tags already in the chip bar", async () => {
    loadStudio((doc) => {
      const chip = doc.createElement("ytcp-chip");
      chip.textContent = "fox";
      doc.querySelector("#chip-list")?.append(chip);
    });
    await fillStudio(document, item, [], noWait);
    expect(chips()).toEqual(["fox", "cliff diving"]);
  });

  it("copies the tags Studio wouldn't turn into chips", async () => {
    loadStudio(undefined, []);
    const results = await fillStudio(document, item, [], noWait);
    expect(results.find((result) => result.field === "tags")).toMatchObject({
      ok: false,
      copy: "fox, cliff diving",
    });
  });

  it('answers "No" to AI use when the pack says so, and never presses Publish', async () => {
    const results = await fillStudio(
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
    const results = await fillStudio(document, item, [], noWait);
    expect(results.find((result) => result.field === "altered")?.ok).toBe(true);
    expect(
      document
        .querySelector('[aria-label="Yes, AI was used"]')
        ?.classList.contains("iron-selected"),
    ).toBe(true);
  });

  it("says what to choose by hand when the AI use question isn't there", async () => {
    loadStudio((doc) => doc.querySelector("#altered-content")?.remove());
    const results = await fillStudio(document, item, [], noWait);
    const altered = results.find((result) => result.field === "altered");
    expect(altered?.ok).toBe(false);
    expect(altered?.message).toContain('choose "Yes" under AI use by hand');
    // Show more was pressed once and stays open, so Tags still fill.
    expect(results.find((result) => result.field === "tags")?.ok).toBe(true);
    expect(pressed).toEqual([]);
  });

  it("leaves AI use alone for a pack from an older Slopify", async () => {
    const { alteredContent: _dropped, ...older } = item;
    const results = await fillStudio(document, older, [], noWait);
    expect(results.some((result) => result.field === "altered")).toBe(false);
    expect(selected("VIDEO_HAS_ALTERED_CONTENT_YES")).toBe(false);
    expect(selected("VIDEO_HAS_ALTERED_CONTENT_NO")).toBe(false);
  });

  it("puts three thumbnails into A/B Testing when Studio offers it", async () => {
    const results = await fillStudio(
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
    const results = await fillStudio(
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
    const results = await fillStudio(document, item, [png("one.png"), png("two.png")], noWait);
    expect(document.querySelector<HTMLInputElement>("#file-loader")?.files?.[0]?.name).toBe(
      "one.png",
    );
    expect(results.find((result) => result.field === "thumbnails")?.message).toContain(
      "add thumbnail 2 there by hand",
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

  it("names a playlist Studio doesn't have, and closes the list", async () => {
    const results = await fillStudio(document, { ...item, playlist: "Owls" }, [], noWait);
    expect(results.find((result) => result.field === "playlist")).toMatchObject({
      ok: false,
      copy: "Owls",
    });
    expect(results.find((result) => result.field === "playlist")?.message).toContain('"Owls"');
    expect(document.querySelector("ytcp-playlist-dialog")?.hasAttribute("hidden")).toBe(true);
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

afterEach(() => {
  document.body.innerHTML = "";
});

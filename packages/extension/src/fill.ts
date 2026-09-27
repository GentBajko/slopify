import type { PackItem } from "./pack.js";
import {
  abTestButton,
  abTestInputs,
  alteredNo,
  alteredYes,
  description,
  type FieldSelectors,
  findAll,
  findField,
  forbidden,
  notForKids,
  playlistDialog,
  playlistDone,
  playlistItemCheckbox,
  playlistItemName,
  playlistItems,
  playlistTrigger,
  showMore,
  tagChips,
  tags,
  thumbnailInput,
  title,
} from "./selectors.js";

// Fills the Details step of Studio's upload dialog from one pack item, field by field, in the
// order Studio shows them. Each field either fills and is checked, or fails on its own with a
// sentence saying what to do by hand; one field failing never stops the others, and nothing
// here presses Next, Save or Publish. The person reviews and publishes.

export type FieldName =
  | "title"
  | "description"
  | "thumbnails"
  | "playlist"
  | "audience"
  | "altered"
  | "tags";

export interface FieldResult {
  readonly field: FieldName;
  readonly ok: boolean;
  // What the toast says.
  readonly message: string;
  // The text to put on the clipboard for a field that has to be filled by hand.
  readonly copy?: string | undefined;
}

export interface FillOptions {
  // Waits between looks for a field that appears after a click; a test passes one that
  // doesn't wait.
  readonly sleep?: (ms: number) => Promise<void>;
  // How long to look for a field that appears after a click.
  readonly timeoutMs?: number;
}

export class RefusedClick extends Error {}

type WaitFor = (field: FieldSelectors, within?: ParentNode) => Promise<Element | null>;

export async function fillStudio(
  root: Document,
  item: PackItem,
  thumbnails: readonly File[],
  options: FillOptions = {},
): Promise<readonly FieldResult[]> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const timeoutMs = options.timeoutMs ?? 4000;
  const waitFor: WaitFor = async (field, within = root) => {
    for (let waited = 0; ; waited += 100) {
      const found = findField(within, field);
      if (found !== null && visible(found)) return found;
      if (waited >= timeoutMs) return null;
      await sleep(100);
    }
  };
  const results: FieldResult[] = [];
  const attempt = async (run: () => Promise<FieldResult>, fallback: FieldResult) => {
    try {
      results.push(await run());
    } catch (error) {
      results.push(
        error instanceof RefusedClick ? { ...fallback, message: error.message } : fallback,
      );
    }
  };

  await attempt(
    async () => textField("title", findField(root, title), item.title, "the Title field"),
    missingText("title", "the Title field", item.title),
  );
  await attempt(
    async () =>
      textField(
        "description",
        findField(root, description),
        item.description,
        "the Description field",
      ),
    missingText("description", "the Description field", item.description),
  );
  if (thumbnails.length > 0)
    await attempt(() => fillThumbnails(root, thumbnails, waitFor), {
      field: "thumbnails",
      ok: false,
      message:
        "Couldn't find the Thumbnail upload — press Upload file under Thumbnail and pick the thumbnail from the project folder (Slopify → Prepare upload → Open folder).",
    });
  if (item.playlist !== null) {
    const playlist = item.playlist;
    await attempt(() => fillPlaylist(root, playlist, waitFor), {
      field: "playlist",
      ok: false,
      message: `Couldn't find the Playlists field — the playlist name "${playlist}" is copied, pick it by hand.`,
      copy: playlist,
    });
  }
  await attempt(
    async () => {
      const radio = findField(root, notForKids);
      if (radio === null) throw new Error("missing");
      click(radio);
      if (!checked(radio)) throw new Error("not checked");
      return {
        field: "audience",
        ok: true,
        message: 'Audience set to "No, it\'s not made for kids".',
      };
    },
    {
      field: "audience",
      ok: false,
      message:
        "Couldn't find the audience question — choose \"No, it's not made for kids\" under Audience by hand.",
    },
  );
  // Show more is a toggle: it is pressed at most once, only while its label still offers to
  // show the advanced settings and the field it reveals isn't showing, so a second field never
  // closes what the first opened.
  let expanded = false;
  const revealed = async (field: FieldSelectors): Promise<Element | null> => {
    const found = findField(root, field);
    if (found !== null && visible(found)) return found;
    if (!expanded) {
      expanded = true;
      const more = findField(root, showMore);
      if (more !== null && collapsed(more)) click(more);
    }
    return waitFor(field);
  };
  const altered = item.alteredContent;
  if (altered !== undefined) {
    const answer = altered.altered ? "Yes" : "No";
    await attempt(
      async () => {
        const radio = await revealed(altered.altered ? alteredYes : alteredNo);
        if (radio === null) throw new Error("missing");
        click(radio);
        if (!checked(radio)) throw new Error("not checked");
        return {
          field: "altered",
          ok: true,
          message: `AI use set to "${answer}". ${altered.why}`,
        };
      },
      {
        field: "altered",
        ok: false,
        message: `Couldn't find the AI use question — press Show more under the description and choose "${answer}" under AI use by hand. ${altered.why}`,
      },
    );
  }
  if (item.tags.length > 0) {
    const line = item.tags.join(", ");
    await attempt(
      async () => {
        const input = await revealed(tags);
        if (!(input instanceof viewOf(root).HTMLInputElement)) throw new Error("missing");
        return typeTags(root, input, item.tags);
      },
      missingText("tags", "the Tags field", line),
    );
  }
  return results;
}

function missingText(field: FieldName, label: string, text: string): FieldResult {
  return {
    field,
    ok: false,
    message: `Couldn't find ${label} — the text is copied, paste it by hand.`,
    copy: text,
  };
}

function textField(
  field: FieldName,
  element: Element | null,
  text: string,
  label: string,
): FieldResult {
  if (element === null || !(element instanceof viewOf(element.ownerDocument).HTMLElement))
    return missingText(field, label, text);
  setEditableText(element, text);
  if (normalized(element.innerText ?? element.textContent ?? "") !== normalized(text))
    return {
      field,
      ok: false,
      message: `Couldn't fill ${label} — Studio didn't take the text. It is copied, paste it by hand.`,
      copy: text,
    };
  return { field, ok: true, message: `${capitalized(label.replace(/^the /, ""))} filled.` };
}

async function fillThumbnails(
  root: Document,
  files: readonly File[],
  waitFor: WaitFor,
): Promise<FieldResult> {
  const HTMLInput = viewOf(root).HTMLInputElement;
  const input = findField(root, thumbnailInput);
  const first = files[0];
  if (first === undefined) throw new Error("no files");
  // Two or three for A/B Testing, when Studio offers it; otherwise the first in the one slot.
  let abOpened = false;
  if (files.length > 1) {
    const button = findField(root, abTestButton);
    if (button !== null && visible(button)) {
      click(button);
      abOpened = true;
      await waitFor(abTestInputs);
      const inputs = findAll(root, abTestInputs).filter(
        (candidate): candidate is HTMLInputElement =>
          candidate instanceof HTMLInput && candidate !== input,
      );
      if (inputs.length >= files.length) {
        files.forEach((file, index) => {
          const slot = inputs[index];
          if (slot !== undefined) setFiles(slot, [file]);
        });
        return {
          field: "thumbnails",
          ok: true,
          message: `All ${String(files.length)} thumbnails are in A/B Testing. Check them there and confirm the test in Studio yourself.`,
        };
      }
    }
  }
  if (!(input instanceof HTMLInput)) throw new Error("missing");
  setFiles(input, [first]);
  if (files.length === 1) return { field: "thumbnails", ok: true, message: "Thumbnail set." };
  const others = files.length === 2 ? "thumbnail 2" : "thumbnails 2 and 3";
  return {
    field: "thumbnails",
    ok: true,
    message: abOpened
      ? `Thumbnail 1 is set. Studio's A/B Testing opened, but Slopify couldn't find where it takes the pictures, so add ${others} there by hand from the project folder (Slopify → Prepare upload → Open folder).`
      : `Thumbnail 1 is set. Studio's A/B Testing button wasn't found, so add ${others} by hand: press A/B Testing beside the title (it may only appear after the upload is saved) and pick them from the project folder.`,
  };
}

// Opens the Playlists list, ticks the one row named `name` (leaving the others as they are)
// and closes the list with its own Done.
async function fillPlaylist(root: Document, name: string, waitFor: WaitFor): Promise<FieldResult> {
  const trigger = findField(root, playlistTrigger);
  if (trigger === null) throw new Error("missing");
  click(trigger);
  const dialog = await waitFor(playlistDialog);
  const close = () => {
    const done = dialog === null ? null : findField(dialog, playlistDone);
    if (done !== null) click(done);
    else
      (dialog ?? trigger).dispatchEvent(
        new (viewOf(root).KeyboardEvent)("keydown", { bubbles: true, key: "Escape" }),
      );
  };
  if (dialog === null)
    return {
      field: "playlist",
      ok: false,
      message: `Couldn't open the playlist list — the playlist name "${name}" is copied, press Select under Playlists and pick it by hand.`,
      copy: name,
    };
  const wanted = name.trim().toLowerCase();
  const rows = findAll(dialog, playlistItems);
  const nameOf = (row: Element) =>
    (findField(row, playlistItemName)?.textContent ?? row.textContent ?? "").trim().toLowerCase();
  const row = rows.find((candidate) => nameOf(candidate) === wanted);
  if (row === undefined) {
    close();
    return {
      field: "playlist",
      ok: false,
      message: `Couldn't find the playlist "${name}" in Studio — create it there or pick one by hand; the name is copied.`,
      copy: name,
    };
  }
  const box = findField(row, playlistItemCheckbox) ?? row;
  if (!checked(box)) click(box);
  const ticked = checked(box);
  close();
  return ticked
    ? { field: "playlist", ok: true, message: `Added to the playlist "${name}".` }
    : {
        field: "playlist",
        ok: false,
        message: `Couldn't tick the playlist "${name}" — the name is copied, press Select under Playlists and tick it by hand.`,
        copy: name,
      };
}

// Types each tag into the chip bar's input and ends it with Enter, then a comma if Studio
// kept the text, so each becomes a chip. Tags already showing as chips are skipped.
function typeTags(root: Document, input: HTMLInputElement, wanted: readonly string[]): FieldResult {
  const existing = new Set(
    findAll(root, tagChips).map((chip) => (chip.textContent ?? "").trim().toLowerCase()),
  );
  const left: string[] = [];
  for (const tag of wanted) {
    if (existing.has(tag.toLowerCase())) continue;
    setInputValue(input, tag);
    pressKey(input, "Enter");
    if (input.value.trim() !== "") {
      setInputValue(input, `${tag},`);
      pressKey(input, ",");
    }
    if (input.value.trim() !== "") {
      left.push(tag);
      setInputValue(input, "");
    }
    existing.add(tag.toLowerCase());
  }
  input.blur();
  if (left.length > 0)
    return {
      field: "tags",
      ok: false,
      message: `Couldn't add ${String(left.length)} of the tags — Studio didn't turn them into tags. The text is copied, paste it into Tags by hand.`,
      copy: left.join(", "),
    };
  return { field: "tags", ok: true, message: `Tags filled (${String(wanted.length)}).` };
}

// Presses a control, never one of the upload's own Next/Save/Publish buttons.
export function click(element: Element): void {
  for (const selector of forbidden)
    if (element.closest(selector) !== null)
      throw new RefusedClick(
        "Slopify's filler stopped before pressing one of Studio's Next, Save or Publish buttons. Nothing was published; finish the upload by hand.",
      );
  (element as HTMLElement).click();
}

// Studio's title and description are contenteditable divs whose Polymer bindings listen for
// input events. The text goes in as if typed: focus, select everything, then the editor's own
// insertText, line by line with insertLineBreak between, so each "\n" becomes a real line
// break. Where the page refuses that (or the result differs), the text is set as text nodes and
// <br>s and an input event says so.
export function setEditableText(element: HTMLElement, text: string): void {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const lines = text.split(/\r?\n/);
  element.focus();
  let inserted = false;
  try {
    const range = doc.createRange();
    range.selectNodeContents(element);
    const selection = doc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (typeof doc.execCommand === "function") {
      inserted = text === "" ? doc.execCommand("delete", false) : true;
      lines.forEach((line, index) => {
        if (index > 0) inserted &&= doc.execCommand("insertLineBreak", false);
        if (line !== "") inserted &&= doc.execCommand("insertText", false, line);
      });
    }
  } catch {
    inserted = false;
  }
  if (
    !inserted ||
    normalized(element.innerText ?? element.textContent ?? "") !== normalized(text)
  ) {
    element.replaceChildren();
    lines.forEach((line, index) => {
      if (index > 0) element.append(doc.createElement("br"));
      if (line !== "") element.append(doc.createTextNode(line));
    });
    element.dispatchEvent(
      new (view?.InputEvent ?? InputEvent)("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: text,
      }),
    );
  }
  element.dispatchEvent(new (view?.Event ?? Event)("change", { bubbles: true }));
  element.blur();
}

// A plain input's value, through the prototype's setter so a framework watching the property
// sees the change, then an input event as typing would send.
export function setInputValue(input: HTMLInputElement, value: string): void {
  const view = input.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(
    view?.HTMLInputElement.prototype ?? HTMLInputElement.prototype,
    "value",
  )?.set;
  input.focus();
  if (setter === undefined) input.value = value;
  else setter.call(input, value);
  input.dispatchEvent(
    new (view?.InputEvent ?? InputEvent)("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: value,
    }),
  );
}

function pressKey(input: HTMLInputElement, key: string): void {
  const view = input.ownerDocument.defaultView;
  const code = key === "Enter" ? "Enter" : "Comma";
  for (const type of ["keydown", "keypress", "keyup"])
    input.dispatchEvent(
      new (view?.KeyboardEvent ?? KeyboardEvent)(type, {
        bubbles: true,
        composed: true,
        cancelable: true,
        key,
        code,
        ...(key === "Enter" ? { keyCode: 13, which: 13 } : { keyCode: 188, which: 188 }),
      }),
    );
}

export function setFiles(input: HTMLInputElement, files: readonly File[]): void {
  const view = input.ownerDocument.defaultView;
  const transfer = new (view?.DataTransfer ?? DataTransfer)();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new (view?.Event ?? Event)("input", { bubbles: true }));
  input.dispatchEvent(new (view?.Event ?? Event)("change", { bubbles: true }));
}

// The page's own window, whose element classes the page's elements are instances of.
function viewOf(doc: Document): Window & typeof globalThis {
  const view = doc.defaultView;
  if (view === null) throw new Error("The Studio page has no window.");
  return view;
}

// Studio marks the chosen radio with the class `iron-selected` and the `checked` attribute;
// checkboxes use aria-checked.
function checked(element: Element): boolean {
  return (
    element.classList.contains("iron-selected") ||
    element.getAttribute("aria-checked") === "true" ||
    element.hasAttribute("checked") ||
    (element as HTMLInputElement).checked === true
  );
}

// Show more offers to show ("Show advanced settings", "Show more") while the settings are
// hidden; an unlabelled toggle is assumed collapsed, since it is only pressed when the field
// it reveals isn't showing.
function collapsed(toggle: Element): boolean {
  const label = (toggle.getAttribute("aria-label") ?? toggle.textContent ?? "").trim();
  return label === "" || /^show/i.test(label);
}

function visible(element: Element): boolean {
  return element.closest("[hidden]") === null;
}

// Line breaks come back as <br>, <div> or "\n" depending on how the editor took the text (and
// a <br> leaves no character in textContent), so the check compares the text without any
// whitespace.
function normalized(text: string): string {
  return text.replace(/[\s\u00a0]+/g, "");
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

import type { PackItem } from "./pack.js";
import {
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
  tags,
  testAndCompareButton,
  testAndCompareInputs,
  thumbnailInput,
  title,
} from "./selectors.js";

// Fills the Details step of Studio's upload dialog from one pack item, field by field, in the
// order Studio shows them. Each field either fills and is checked, or fails on its own with a
// sentence saying what to do by hand; one field failing never stops the others, and nothing
// here presses Next, Save or Publish. The person reviews and publishes.

export type FieldName = "title" | "description" | "thumbnails" | "playlist" | "audience" | "tags";

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

export async function fillStudio(
  root: Document,
  item: PackItem,
  thumbnails: readonly File[],
  options: FillOptions = {},
): Promise<readonly FieldResult[]> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const timeoutMs = options.timeoutMs ?? 4000;
  const waitFor = async (field: FieldSelectors, within: ParentNode = root) => {
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
  if (item.tags.length > 0) {
    const line = item.tags.join(", ");
    await attempt(
      async () => {
        let input = findField(root, tags);
        if (input === null || !visible(input)) {
          const more = findField(root, showMore);
          if (more !== null) click(more);
          input = await waitFor(tags);
        }
        if (!(input instanceof viewOf(root).HTMLInputElement)) throw new Error("missing");
        setInputValue(input, `${line},`);
        return { field: "tags", ok: true, message: `Tags filled (${String(item.tags.length)}).` };
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
  waitFor: (field: FieldSelectors, within?: ParentNode) => Promise<Element | null>,
): Promise<FieldResult> {
  const HTMLInput = viewOf(root).HTMLInputElement;
  // Three for Test & Compare, when Studio offers it; otherwise the first in the one slot.
  if (files.length > 1) {
    const button = findField(root, testAndCompareButton);
    if (button !== null && visible(button)) {
      click(button);
      await waitFor(testAndCompareInputs);
      const inputs = findAll(root, testAndCompareInputs).filter(
        (input): input is HTMLInputElement => input instanceof HTMLInput,
      );
      if (inputs.length >= files.length) {
        files.forEach((file, index) => {
          const input = inputs[index];
          if (input !== undefined) setFiles(input, [file]);
        });
        return {
          field: "thumbnails",
          ok: true,
          message: `All ${String(files.length)} thumbnails are in Test & compare. Check them and press its Done.`,
        };
      }
    }
  }
  const input = findField(root, thumbnailInput);
  if (!(input instanceof HTMLInput)) throw new Error("missing");
  const first = files[0];
  if (first === undefined) throw new Error("no files");
  setFiles(input, [first]);
  return files.length > 1
    ? {
        field: "thumbnails",
        ok: true,
        message: `Thumbnail 1 is set. Studio's Test & compare wasn't found, so add thumbnails 2 and 3 by hand: press Test & compare under Thumbnail and pick them from the project folder.`,
      }
    : { field: "thumbnails", ok: true, message: "Thumbnail set." };
}

async function fillPlaylist(
  root: Document,
  name: string,
  waitFor: (field: FieldSelectors, within?: ParentNode) => Promise<Element | null>,
): Promise<FieldResult> {
  const trigger = findField(root, playlistTrigger);
  if (trigger === null) throw new Error("missing");
  click(trigger);
  const dialog = await waitFor(playlistDialog);
  if (dialog === null) throw new Error("no dialog");
  const wanted = name.trim().toLowerCase();
  const row = findAll(dialog, playlistItems).find(
    (candidate) =>
      (findField(candidate, playlistItemName)?.textContent ?? "").trim().toLowerCase() === wanted,
  );
  const close = () => {
    const done = findField(root, playlistDone);
    if (done !== null) click(done);
  };
  if (row === undefined) {
    close();
    return {
      field: "playlist",
      ok: false,
      message: `Couldn't find the playlist "${name}" in Studio — create it there or pick one by hand; the name is copied.`,
      copy: name,
    };
  }
  const box = findField(row, playlistItemCheckbox);
  if (box === null) throw new Error("no checkbox");
  if (!checked(box)) click(box);
  close();
  return { field: "playlist", ok: true, message: `Added to the playlist "${name}".` };
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

// Studio's text boxes are contenteditable divs listening for input events. Typing through the
// editor keeps its own state right; setting the text directly is the fallback.
export function setEditableText(element: HTMLElement, text: string): void {
  const doc = element.ownerDocument;
  element.focus();
  let inserted = false;
  try {
    const range = doc.createRange();
    range.selectNodeContents(element);
    const selection = doc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    inserted = typeof doc.execCommand === "function" && doc.execCommand("insertText", false, text);
  } catch {
    inserted = false;
  }
  if (
    !inserted ||
    normalized(element.innerText ?? element.textContent ?? "") !== normalized(text)
  ) {
    element.textContent = text;
    element.dispatchEvent(
      new (doc.defaultView?.InputEvent ?? InputEvent)("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }),
    );
  }
  element.dispatchEvent(new (doc.defaultView?.Event ?? Event)("change", { bubbles: true }));
  element.blur();
}

// A plain input's value, through the prototype's setter so a framework watching the property
// sees the change.
export function setInputValue(input: HTMLInputElement, value: string): void {
  const view = input.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(
    view?.HTMLInputElement.prototype ?? HTMLInputElement.prototype,
    "value",
  )?.set;
  input.focus();
  if (setter === undefined) input.value = value;
  else setter.call(input, value);
  input.dispatchEvent(new (view?.Event ?? Event)("input", { bubbles: true }));
  input.dispatchEvent(new (view?.Event ?? Event)("change", { bubbles: true }));
  // Studio turns the typed text into tags on Enter.
  input.dispatchEvent(
    new (view?.KeyboardEvent ?? KeyboardEvent)("keydown", {
      bubbles: true,
      key: "Enter",
      code: "Enter",
    }),
  );
  input.blur();
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

function checked(element: Element): boolean {
  return (
    element.getAttribute("aria-checked") === "true" ||
    element.hasAttribute("checked") ||
    (element as HTMLInputElement).checked === true
  );
}

function visible(element: Element): boolean {
  return element.closest("[hidden]") === null;
}

// Line breaks come back as <br>, <div> or "\n" depending on how the editor took the text, so
// the check compares the words, not the whitespace between them.
function normalized(text: string): string {
  return text.replace(/[\s ]+/g, " ").trim();
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

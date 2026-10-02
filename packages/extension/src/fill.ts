import { type PackItem, playlistsOf } from "./pack.js";
import {
  abBothChip,
  abBothText,
  abTestButton,
  abTestChips,
  abTestDialog,
  abTestInputs,
  abTestTitles,
  abThumbnailOnlyChip,
  abThumbnailOnlyText,
  abTitleOnlyChip,
  abTitleOnlyText,
  alteredNo,
  alteredYes,
  description,
  type FieldSelectors,
  findAll,
  findField,
  forbidden,
  forbiddenLabels,
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

// Fills the Details step of Studio's upload dialog from one pack item, in the order Studio
// shows the fields. First it checks that every field the item needs is on the page (pressing
// Show more, if needed, to see AI use and Tags): if any is missing, Studio has changed and it
// fills nothing at all, so the person never gets a half-filled dialog, and says which fields
// it couldn't find. Then each field fills and is checked, or fails on its own with a sentence
// saying what to do by hand (Studio didn't take the text, a playlist Studio doesn't have).
// Nothing here presses Next, Save, Publish or A/B Testing's Set test. The person reviews and
// publishes.

export type FieldName =
  | "title"
  | "description"
  | "thumbnails"
  | "playlist"
  | "audience"
  | "altered"
  | "tags"
  // A/B Testing's other titles, when no thumbnails are tested beside them.
  | "titles";

export interface FieldResult {
  readonly field: FieldName;
  readonly ok: boolean;
  // What the toast says.
  readonly message: string;
  // The text to put on the clipboard for a field that has to be filled by hand.
  readonly copy?: string | undefined;
}

export interface FillOptions {
  // The A/B test starts later, once the video is public (`startAbTest`): the upload gets only
  // the first thumbnail, in its slot.
  readonly abTestLater?: boolean;
  // Waits between looks for a field that appears after a click; a test passes one that
  // doesn't wait.
  readonly sleep?: (ms: number) => Promise<void>;
  // How long to look for a field that appears after a click. When given, it is also how long
  // to wait for A/B Testing's dialog (else 3 s) and the playlist rows (else 5 s).
  readonly timeoutMs?: number;
}

export class RefusedClick extends Error {}

// Either the fields were filled (each with its own result), or a field the item needs wasn't
// on the page and nothing was written; `missing` names those fields ("the Tags field").
export type FillReport =
  | { readonly filled: true; readonly results: readonly FieldResult[] }
  | { readonly filled: false; readonly missing: readonly string[] };

// Looks every 100 ms until `look` finds something, for up to `ms`.
type Until = <T>(look: () => T | null | undefined, ms?: number) => Promise<T | null>;
type WaitFor = (field: FieldSelectors, within?: ParentNode, ms?: number) => Promise<Element | null>;
interface Waits {
  readonly until: Until;
  readonly waitFor: WaitFor;
  readonly abDialogMs: number;
  readonly rowsMs: number;
}

function waitsFor(root: Document, options: FillOptions): Waits {
  const sleep = options.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const timeoutMs = options.timeoutMs ?? 4000;
  const until: Until = async (look, ms = timeoutMs) => {
    for (let waited = 0; ; waited += 100) {
      const found = look();
      if (found !== null && found !== undefined) return found;
      if (waited >= ms) return null;
      await sleep(100);
    }
  };
  // Studio's overlays carry no `opened` attribute while showing, so a field counts once it is
  // laid out (see `visible`).
  const waitFor: WaitFor = (field, within = root, ms = timeoutMs) =>
    until(() => findShown(within, field), ms);
  return {
    until,
    waitFor,
    abDialogMs: options.timeoutMs ?? 3000,
    rowsMs: options.timeoutMs ?? 5000,
  };
}

export async function fillStudio(
  root: Document,
  item: PackItem,
  thumbnails: readonly File[],
  options: FillOptions = {},
): Promise<FillReport> {
  const waits = waitsFor(root, options);
  const { waitFor } = waits;
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

  // Every field this item needs, before anything is written.
  const needed: FieldSelectors[] = [title, description];
  if (thumbnails.length > 0) needed.push(thumbnailInput);
  const playlists = playlistsOf(item);
  if (playlists.length > 0) needed.push(playlistTrigger);
  needed.push(notForKids);
  const missing = needed
    .filter((field) => findField(root, field) === null)
    .map((field) => field.label);
  const advanced: FieldSelectors[] = [];
  if (item.alteredContent !== undefined)
    advanced.push(item.alteredContent.altered ? alteredYes : alteredNo);
  if (item.tags.length > 0) advanced.push(tags);
  for (const field of advanced) {
    const found = await revealed(field).catch(() => null);
    if (found === null) missing.push(field.label);
  }
  if (missing.length > 0) return { filled: false, missing };

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
  // One thumbnail goes in its slot now. Two or three go into A/B Testing, but last of all: its
  // dialog is left open for the person to press Set test, and pressing anything else while it
  // shows could close it and drop the pictures. Their result still takes this place.
  const thumbnailFallback: FieldResult = {
    field: "thumbnails",
    ok: false,
    message:
      "Couldn't find the Thumbnail upload — press Upload file under Thumbnail and pick the thumbnail from the project folder (Slopify → Prepare upload → Open folder).",
  };
  // Other titles (Slopify's A/B titles) go into A/B Testing too, beside the video's title.
  const later = options.abTestLater === true;
  const otherTitles = later ? [] : (item.titles ?? []);
  const pictures = later ? thumbnails.slice(0, 1) : thumbnails;
  const abFallback: FieldResult =
    pictures.length > 1
      ? thumbnailFallback
      : {
          field: "titles",
          ok: false,
          message:
            "Couldn't fill A/B Testing's titles: press A/B Testing beside the title, choose Title only and paste the other titles. They are copied.",
          copy: otherTitles.join("\n"),
        };
  let abSlot = -1;
  if (pictures.length === 1)
    await attempt(async () => setThumbnail(root, pictures), thumbnailFallback);
  if (pictures.length > 1 || otherTitles.length > 0) {
    abSlot = results.length;
    results.push(abFallback);
  }
  if (playlists.length > 0) {
    const names = playlists.join(", ");
    await attempt(() => fillPlaylists(root, playlists, waits), {
      field: "playlist",
      ok: false,
      message: `Couldn't find the Playlists field — the playlist name "${names}" is copied, pick it by hand.`,
      copy: names,
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
  if (abSlot >= 0) {
    const at = results.length;
    await attempt(
      () => fillAbTest(root, pictures, otherTitles, item.title, waits, true),
      abFallback,
    );
    const [done] = results.splice(at, 1);
    if (done !== undefined) results[abSlot] = done;
  }
  return { filled: true, results };
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

// The first thumbnail in the single Thumbnail slot of the metadata editor (never one of A/B
// Testing's slots, which `thumbnailInput` excludes).
function setThumbnail(root: Document, files: readonly File[]): FieldResult {
  const input = findField(root, thumbnailInput);
  const first = files[0];
  if (first === undefined || !(input instanceof viewOf(root).HTMLInputElement))
    throw new Error("missing");
  setFiles(input, [first]);
  return { field: "thumbnails", ok: true, message: "Thumbnail set." };
}

// A/B Testing, last of all: with other titles (`item.titles`) and two or three thumbnails it
// picks "Title and thumbnail", with titles alone "Title only", with thumbnails alone "Thumbnail
// only". It presses A/B Testing with a whole pointer sequence (Studio ignored a plain `.click()`
// from a script), puts the video's title and the others in title boxes 1, 2 and 3 and
// thumbnails 1, 2 and 3 in their rows. The dialog is left open: the person checks it and
// presses Set test. When A/B Testing isn't there, doesn't open or can't be filled, the first
// thumbnail goes in the single Thumbnail slot and the message says what to add by hand.
async function fillAbTest(
  root: Document,
  files: readonly File[],
  titles: readonly string[],
  title: string,
  waits: Waits,
  // On the upload, a test that can't be filled leaves thumbnail 1 in the single slot; on a
  // published video (`startAbTest`) nothing is touched.
  slotFallback: boolean,
): Promise<FieldResult> {
  const testsPictures = files.length > 1;
  const testsTitles = titles.length > 0;
  const mode =
    testsPictures && testsTitles ? abBothText : testsTitles ? abTitleOnlyText : abThumbnailOnlyText;
  const field: FieldName = testsPictures ? "thumbnails" : "titles";
  const folder = "the project folder (Slopify → Prepare upload → Open folder)";
  const asked = [
    ...(testsPictures ? [files.length === 2 ? "thumbnail 2" : "thumbnails 2 and 3"] : []),
    ...(testsTitles ? [titles.length === 1 ? "the other title" : "the other titles"] : []),
  ].join(" and ");
  const copy = testsTitles ? titles.join("\n") : undefined;
  const byHand = (why: string): FieldResult => {
    if (!slotFallback) return { field, ok: false, message: why, copy };
    if (testsPictures) setThumbnail(root, files);
    const set = testsPictures ? "Thumbnail 1 is set. " : "";
    const pictures = testsPictures ? ` Pick the pictures from ${folder}.` : "";
    const words = testsTitles ? " The titles are copied." : "";
    return { field, ok: testsPictures, message: `${set}${why}${pictures}${words}`, copy };
  };
  const button = findShown(root, abTestButton);
  if (button === undefined)
    return byHand(
      `Studio's A/B Testing button wasn't found, so add ${asked} by hand: press A/B Testing beside the title (it may only appear after the upload is saved) and choose ${mode}.`,
    );
  press(button);
  const dialog = await waits.waitFor(abTestDialog, root, waits.abDialogMs);
  if (dialog === null)
    return byHand(
      `Studio's A/B Testing didn't open when Slopify pressed it, so add ${asked} by hand: press A/B Testing beside the title and choose ${mode}.`,
    );
  const fallbackChip =
    mode === abBothText
      ? abBothChip
      : mode === abTitleOnlyText
        ? abTitleOnlyChip
        : abThumbnailOnlyChip;
  const chip =
    findAll(dialog, abTestChips).find(
      (one) => (one.textContent ?? "").trim().toLowerCase() === mode.toLowerCase(),
    ) ?? findField(dialog, fallbackChip);
  if (chip !== null) press(chip);
  const HTMLInput = viewOf(root).HTMLInputElement;
  const HTMLBox = viewOf(root).HTMLElement;
  const inputs = testsPictures
    ? await waits.until(() => {
        const found = findAll(root, abTestInputs).filter(
          (one): one is HTMLInputElement => one instanceof HTMLInput,
        );
        return found.length >= files.length ? found : null;
      }, waits.abDialogMs)
    : [];
  const boxes = testsTitles
    ? await waits.until(() => {
        const found = findAll(root, abTestTitles).filter(
          (one): one is HTMLElement => one instanceof HTMLBox,
        );
        return found.length >= titles.length + 1 ? found : null;
      }, waits.abDialogMs)
    : [];
  if (inputs === null || boxes === null)
    return byHand(
      `Studio's A/B Testing opened, but Slopify couldn't find where it takes ${inputs === null ? "the pictures" : "the titles"}, so add ${asked} there by hand (choose ${mode}).`,
    );
  files.forEach((file, index) => {
    const slot = inputs[index];
    if (slot !== undefined) setFiles(slot, [file]);
  });
  // Title 1 is the video's own title; Studio fills it in, and an empty one is filled here.
  const [own, ...others] = boxes;
  if (own !== undefined && (own.textContent ?? "").trim() === "") setEditableText(own, title);
  titles.forEach((one, index) => {
    const box = others[index];
    if (box !== undefined) setEditableText(box, one);
  });
  const parts = [
    ...(testsPictures
      ? [`${files.length === 2 ? "both" : `all ${String(files.length)}`} thumbnails`]
      : []),
    ...(testsTitles
      ? [`${titles.length === 1 ? "the other title" : `the ${String(titles.length)} other titles`}`]
      : []),
  ].join(" and ");
  return {
    field,
    ok: true,
    message: `Studio's A/B Testing (${mode}) has ${parts}, and is left open. Check them there, then press Set test yourself; closing the dialog drops them.`,
  };
}

// A published video's A/B test, on its Details page in a tab the extension opened for it:
// fills A/B Testing as on the upload, then presses Set test, and Save when Studio then asks for
// it. Only this path presses them, and only for a test the person queued in Slopify. When
// anything isn't found it presses nothing and says why.
export async function startAbTest(
  root: Document,
  item: PackItem,
  thumbnails: readonly File[],
  options: FillOptions = {},
): Promise<FieldResult> {
  const waits = waitsFor(root, options);
  const filled = await fillAbTest(root, thumbnails, item.titles ?? [], item.title, waits, false);
  if (!filled.ok) return filled;
  const dialog = findShown(root, abTestDialog);
  const setTest =
    dialog === undefined
      ? undefined
      : [...dialog.querySelectorAll("ytcp-button, button")].find(
          (one) => (one.textContent ?? "").trim().toLowerCase() === "set test",
        );
  if (setTest === undefined)
    return {
      field: filled.field,
      ok: false,
      message: `${filled.message} Slopify couldn't find Set test, so press it yourself.`,
    };
  const settled = waits.until(
    () => (setTest.closest("[disabled], [aria-disabled=true]") === null ? true : null),
    waits.abDialogMs,
  );
  if ((await settled) === null)
    return {
      field: filled.field,
      ok: false,
      message:
        "Studio's Set test stayed greyed out after the titles and thumbnails went in, so the test wasn't set. Open A/B Testing on the video and check what Studio asks for.",
    };
  pressAnyway(setTest);
  const closed = await waits.until(
    () => (findShown(root, abTestDialog) === undefined ? true : null),
    waits.rowsMs,
  );
  if (closed === null)
    return {
      field: filled.field,
      ok: false,
      message:
        "Slopify pressed Set test, but A/B Testing stayed open. Check the video's A/B Testing in Studio.",
    };
  // A Details page keeps edits until Save; press it only when Studio enabled it for the test.
  const save = root.querySelector("ytcp-button#save");
  if (
    save !== null &&
    !save.hasAttribute("disabled") &&
    save.getAttribute("aria-disabled") !== "true"
  )
    pressAnyway(save);
  return { field: filled.field, ok: true, message: "A/B test set." };
}

// Opens the Playlists list, waits for its rows (an iron-list, which renders them only once the
// list shows), ticks the one row named `name` (leaving the others as they are) and closes the
// list with its own Done, never its Save.
// Opens Studio's playlist list once and ticks each playlist by name, then closes it. One the
// list doesn't show (not made in Studio yet), or whose tick doesn't hold, is named with the
// names copied, to pick by hand.
async function fillPlaylists(
  root: Document,
  names: readonly string[],
  waits: Waits,
): Promise<FieldResult> {
  const all = names.join(", ");
  const trigger = findField(root, playlistTrigger);
  if (trigger === null) throw new Error("missing");
  click(trigger);
  const dialog = await waits.waitFor(playlistDialog);
  if (dialog === null)
    return {
      field: "playlist",
      ok: false,
      message: `Couldn't open the playlist list — the playlist name "${all}" is copied, press Select under Playlists and pick it by hand.`,
      copy: all,
    };
  const list = dialog.closest("ytcp-playlist-dialog") ?? dialog;
  const close = () => {
    const done = findField(list, playlistDone);
    if (done !== null)
      try {
        click(done);
        return;
      } catch (error) {
        // A Done that turns out to be one of the forbidden buttons: Escape closes the list.
        if (!(error instanceof RefusedClick)) throw error;
      }
    list.dispatchEvent(
      new (viewOf(root).KeyboardEvent)("keydown", { bubbles: true, key: "Escape" }),
    );
  };
  const rows =
    (await waits.until(() => {
      const found = findAll(dialog, playlistItems);
      return found.length > 0 ? found : null;
    }, waits.rowsMs)) ?? [];
  const nameOf = (row: Element) =>
    (findField(row, playlistItemName)?.textContent ?? row.textContent ?? "").trim().toLowerCase();
  const absent: string[] = [];
  const unticked: string[] = [];
  for (const name of names) {
    const row = rows.find((candidate) => nameOf(candidate) === name.trim().toLowerCase());
    if (row === undefined) {
      absent.push(name);
      continue;
    }
    const box = findField(row, playlistItemCheckbox) ?? row;
    if (!checked(box)) click(box);
    // The checkbox may re-render after the click, so its tick is looked for a moment.
    if ((await waits.until(() => (checked(box) ? true : null), 1000)) !== true) unticked.push(name);
  }
  close();
  const quoted = (list: readonly string[]) => list.map((one) => `"${one}"`).join(" and ");
  if (absent.length > 0)
    return {
      field: "playlist",
      ok: false,
      message: `Couldn't find the playlist ${quoted(absent)} in Studio — create it there or pick one by hand; the name is copied.`,
      copy: absent.join(", "),
    };
  if (unticked.length > 0)
    return {
      field: "playlist",
      ok: false,
      message: `Couldn't tick the playlist ${quoted(unticked)} — the name is copied, press Select under Playlists and tick it by hand.`,
      copy: unticked.join(", "),
    };
  return {
    field: "playlist",
    ok: true,
    message: `Added to the playlist${names.length > 1 ? "s" : ""} ${quoted(names)}.`,
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

// Presses a control, never one of the upload's own Next/Save/Publish buttons, the playlist
// list's Save or A/B Testing's Set test.
export function click(element: Element): void {
  refuseForbidden(element);
  (element as HTMLElement).click();
}

// Presses a control the way a mouse does: pointerdown, mousedown, pointerup, mouseup, click, all
// bubbling, at the control's middle. Studio's A/B Testing button ignored a plain `.click()`.
export function press(element: Element): void {
  refuseForbidden(element);
  pressAnyway(element);
}

// `press` without the refusal: only `startAbTest` uses it, for Set test and Save.
function pressAnyway(element: Element): void {
  const view = viewOf(element.ownerDocument);
  const box = element.getBoundingClientRect();
  const at: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    clientX: box.left + box.width / 2,
    clientY: box.top + box.height / 2,
  };
  const Pointer = view.PointerEvent ?? view.MouseEvent;
  const pointer = { ...at, pointerId: 1, pointerType: "mouse", isPrimary: true };
  element.dispatchEvent(new Pointer("pointerdown", { ...pointer, buttons: 1 }));
  element.dispatchEvent(new view.MouseEvent("mousedown", { ...at, buttons: 1, detail: 1 }));
  element.dispatchEvent(new Pointer("pointerup", { ...pointer, buttons: 0 }));
  element.dispatchEvent(new view.MouseEvent("mouseup", { ...at, buttons: 0, detail: 1 }));
  element.dispatchEvent(new view.MouseEvent("click", { ...at, buttons: 0, detail: 1 }));
}

function refuseForbidden(element: Element): void {
  const control = element.closest("button, ytcp-button, [role=button]") ?? element;
  const labels = [control.getAttribute("aria-label"), control.textContent].map((one) =>
    (one ?? "").trim().toLowerCase(),
  );
  if (
    forbidden.some((selector) => element.closest(selector) !== null) ||
    forbiddenLabels.some((label) => labels.includes(label.toLowerCase()))
  )
    throw new RefusedClick(
      "Slopify's filler stopped before pressing one of Studio's Next, Save, Publish or Set test buttons. Nothing was published or set; finish the upload by hand.",
    );
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

// Shown: not under a `hidden` attribute or `display: none`, and, where the page is laid out,
// with a box. Studio's overlays (paper-dialogs) carry no `opened` attribute while showing, and
// are `display: none` while closed, which leaves them no client rects.
function visible(element: Element): boolean {
  if (element.closest("[hidden]") !== null) return false;
  const view = element.ownerDocument.defaultView;
  for (let at: Element | null = element; at !== null; at = at.parentElement)
    if (view?.getComputedStyle(at).display === "none") return false;
  return element.getClientRects().length > 0;
}

// The first shown element any of a field's selectors finds.
function findShown(root: ParentNode, field: FieldSelectors): Element | undefined {
  for (const selector of field.selectors) {
    const found = findAll(root, { ...field, selectors: [selector] }).find(visible);
    if (found !== undefined) return found;
  }
  return undefined;
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

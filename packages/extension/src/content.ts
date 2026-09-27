import { browserApi } from "./browser.js";
import { type FieldResult, fillStudio } from "./fill.js";
import { type FillPayload, packText, type WorkerAnswer } from "./pack.js";
import { findField, title, uploadDialog } from "./selectors.js";

// Runs on studio.youtube.com. When an upload dialog shows its Details step (the person has
// dropped the video in), it asks the background worker for the next item waiting in Slopify,
// fills it once, tells Slopify it was filled (so the next upload dialog gets the next item),
// then offers "Fill again from Slopify". If Studio's dialog lacks a field the item needs, it
// fills nothing and puts the whole pack on the clipboard instead. Every message whose text has
// to be pasted by hand has a Copy button, since the page may refuse a clipboard write that no
// click asked for. It never presses Next, Save or Publish.

const api = browserApi();
const panelId = "slopify-studio-panel";
// The title box of the dialog being handled, and the item it was filled with.
let handled: Element | undefined;
let payload: FillPayload | undefined;
let againRow: HTMLElement | undefined;
// Whether Slopify was told this dialog's item is filled, so it leaves the queue once.
let reported = false;

function toastArea(): HTMLElement {
  let area = document.getElementById(panelId);
  if (area !== null) return area;
  area = document.createElement("div");
  area.id = panelId;
  area.setAttribute("role", "status");
  Object.assign(area.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxWidth: "380px",
    font: "13px/1.4 Roboto, Arial, sans-serif",
  });
  document.body.append(area);
  return area;
}

function toast(text: string, tone: "ok" | "error" | "info", copy?: string): void {
  const box = document.createElement("div");
  Object.assign(box.style, {
    background: tone === "error" ? "#5c1a1a" : tone === "ok" ? "#1d3b24" : "#282828",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0,0,0,.4)",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "flex-start",
  });
  const words = document.createElement("span");
  words.textContent = `Slopify: ${text}`;
  words.style.flex = "1";
  box.append(words);
  if (copy !== undefined) box.append(button("Copy", () => void copyFromClick(copy, box)));
  box.append(button("Close", () => box.remove()));
  toastArea().append(box);
}

// The Copy button: a click lets the page write the clipboard. Should even that be refused,
// the text is shown selected in the message, to copy with the keyboard.
async function copyFromClick(text: string, box: HTMLElement): Promise<void> {
  if (await copyText(text)) {
    toast("Copied.", "ok");
    return;
  }
  if (box.querySelector("textarea") !== null) return;
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.rows = 6;
  area.setAttribute("aria-label", "Text to copy");
  Object.assign(area.style, { width: "100%", font: "12px/1.4 monospace" });
  const hint = document.createElement("span");
  hint.textContent =
    "The browser refused the clipboard. The text is selected below: press Ctrl+C (⌘C on a Mac).";
  hint.style.width = "100%";
  box.append(hint, area);
  area.focus();
  area.select();
}

function button(label: string, run: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  Object.assign(element.style, {
    background: "transparent",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.5)",
    borderRadius: "4px",
    padding: "2px 8px",
    cursor: "pointer",
  });
  element.addEventListener("click", run);
  return element;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function file(entry: FillPayload["thumbnails"][number]): File {
  const binary = atob(entry.base64);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
  return new File([bytes], entry.filename, { type: entry.contentType });
}

// "the Title field", "the Title field and the Tags field", "a, b and c".
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

function itemName(item: FillPayload["item"]): string {
  return item.kind === "short" ? `short ${String(item.short)}` : "the video";
}

// Fills the dialog: a new dialog asks Slopify for the next waiting item; Fill again uses the
// same item as before.
async function fill(next: boolean): Promise<void> {
  if (next || payload === undefined) {
    const answer = (await api.runtime.sendMessage({
      type: "payload",
    })) as WorkerAnswer<FillPayload>;
    if (!answer.ok) {
      toast(answer.message, "error");
      return;
    }
    payload = answer.value;
  }
  const current = payload;
  const { item, thumbnails } = current;
  const report = await fillStudio(document, item, thumbnails.map(file));
  if (!report.filled) {
    const text = packText(item);
    const copied = await copyText(text);
    toast(
      `Nothing was filled: Studio's upload dialog has changed, and Slopify couldn't find ${listed(report.missing)}. ${copied ? "The whole upload pack is copied" : "Press Copy for the whole upload pack"}: paste each part by hand, or use the Copy buttons in Slopify → Prepare upload. Updating the extension (Slopify → Settings → YouTube Studio → Download) may fix it.`,
      "error",
      text,
    );
    return;
  }
  const results = report.results;
  // Only one text fits on the clipboard: the first field that needs pasting by hand gets it
  // now, the others through their Copy button.
  let copied = false;
  for (const result of results.filter((one) => !one.ok)) {
    const now: boolean = !copied && result.copy !== undefined && (await copyText(result.copy));
    copied ||= now;
    toast(now ? result.message : byHand(result), "error", result.copy);
  }
  const failed = results.filter((result) => !result.ok).length;
  // Thumbnails and the AI disclosure say what they did, so the person can check them.
  const notes = results.filter(
    (result) => result.ok && (result.field === "thumbnails" || result.field === "altered"),
  );
  for (const note of notes) toast(note.message, "info");
  toast(
    failed === 0
      ? `Filled ${itemName(item)}'s details. Check them, then publish in Studio yourself.`
      : `Filled what it could; ${String(failed)} field${failed === 1 ? "" : "s"} need you. Nothing was published.`,
    failed === 0 ? "ok" : "info",
  );
  if (reported) return;
  reported = true;
  // Filled: it leaves Slopify's queue, and the next upload dialog gets the next item.
  const left = (await api.runtime.sendMessage({
    type: "filled",
    projectId: current.projectId,
    short: item.kind === "short" ? (item.short ?? null) : null,
  })) as WorkerAnswer<number>;
  if (!left.ok) toast(left.message, "error");
  else if (left.value > 0)
    toast(
      `${String(left.value)} more upload${left.value === 1 ? "" : "s"} waiting from Slopify: start the next upload in Studio and it is filled the same way.`,
      "info",
    );
}

// A failure whose text isn't on the clipboard says to press its Copy instead.
function byHand(result: FieldResult): string {
  return result.message
    .replace("the text is copied", "press Copy on this message")
    .replace("It is copied", "Press Copy on this message")
    .replace("The text is copied", "Press Copy on this message")
    .replace("the name is copied", "press Copy for the name")
    .replace(/the playlist name "(.*)" is copied/, 'press Copy for the playlist name "$1"');
}

// Shown: attached, not inside a hidden element, and laid out.
function shown(element: Element): boolean {
  return (
    element.isConnected &&
    element.closest("[hidden]") === null &&
    element.getClientRects().length > 0
  );
}

// Watching all of Studio is costly, so mutations only schedule a look, at most every 250 ms,
// and the watching stops while a dialog is handled: a cheap check each second waits for that
// dialog to close, then the watching starts again for the next upload.
let scheduled: ReturnType<typeof setTimeout> | undefined;
const observer = new MutationObserver(schedule);

function schedule(): void {
  if (scheduled !== undefined) return;
  scheduled = setTimeout(() => {
    scheduled = undefined;
    look();
  }, 250);
}

function watch(): void {
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function look(): void {
  const dialog = findField(document, uploadDialog);
  const titleBox = dialog === null ? null : findField(dialog, title);
  if (titleBox === null || titleBox === handled || !shown(titleBox)) return;
  handled = titleBox;
  observer.disconnect();
  const closed = setInterval(() => {
    if (shown(titleBox)) return;
    clearInterval(closed);
    handled = undefined;
    againRow?.remove();
    watch();
    schedule();
  }, 1000);
  againRow?.remove();
  againRow = document.createElement("div");
  toastArea().append(againRow);
  againRow.append(button("Fill again from Slopify", () => void fill(false)));
  payload = undefined;
  reported = false;
  void fill(true);
}

watch();
look();

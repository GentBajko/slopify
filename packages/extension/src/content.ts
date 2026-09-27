import { browserApi } from "./browser.js";
import { type FieldResult, fillStudio } from "./fill.js";
import type { FillPayload, WorkerAnswer } from "./pack.js";
import { findField, title, uploadDialog } from "./selectors.js";

// Runs on studio.youtube.com. When the upload dialog shows its Details step (the person has
// dropped the video in), it asks the background worker for the pack chosen in Slopify and
// fills the fields once, then offers "Fill again from Slopify". Every field that fails gets
// its own toast, with its text on the clipboard. It never presses Next, Save or Publish.

const api = browserApi();
const panelId = "slopify-studio-panel";
let filledFor: Element | undefined;

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
    gap: "8px",
    alignItems: "flex-start",
  });
  const words = document.createElement("span");
  words.textContent = `Slopify: ${text}`;
  words.style.flex = "1";
  box.append(words);
  if (copy !== undefined) box.append(button("Copy", () => void copyText(copy)));
  box.append(button("Close", () => box.remove()));
  toastArea().append(box);
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

async function fill(): Promise<void> {
  const answer = (await api.runtime.sendMessage({ type: "payload" })) as WorkerAnswer<FillPayload>;
  if (!answer.ok) {
    toast(answer.message, "error");
    return;
  }
  const { item, thumbnails } = answer.value;
  const results = await fillStudio(document, item, thumbnails.map(file));
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
      ? `Filled ${item.kind === "short" ? `short ${String(item.short)}` : "the video"}'s details. Check them, then publish in Studio yourself.`
      : `Filled what it could; ${String(failed)} field${failed === 1 ? "" : "s"} need you. Nothing was published.`,
    failed === 0 ? "ok" : "info",
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

// The details appear once a file is in; each new upload dialog is filled once on its own.
function watch(): void {
  const dialog = findField(document, uploadDialog);
  const titleBox = dialog === null ? null : findField(dialog, title);
  if (dialog === null || titleBox === null || filledFor === titleBox) return;
  filledFor = titleBox;
  const again = document.createElement("div");
  toastArea().append(again);
  again.append(button("Fill again from Slopify", () => void fill()));
  void fill();
}

new MutationObserver(watch).observe(document.documentElement, { childList: true, subtree: true });
watch();

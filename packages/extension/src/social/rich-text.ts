// Typing a post into a site's rich text editor (X's and TikTok's Draft.js, LinkedIn's and
// Bluesky's ProseMirror, Instagram's Lexical). Setting the DOM's text would leave the editor's
// own state empty, so the text goes in the ways a person's would, each checked before the next
// is tried: (1) a paste of the text, which every one of these editors handles; (2) the
// browser's insertText command, line by line; (3) a beforeinput event carrying the text. When
// none of them leaves the editor showing the text, the box is emptied and the text is put on
// the clipboard, with a sentence saying to paste it.

export type RichResult =
  | { readonly ok: true; readonly how: "paste" | "execCommand" | "beforeinput" }
  | { readonly ok: false; readonly sentence: string; readonly copied: boolean };

export interface RichOptions {
  // What the toast calls the box: "the post's text box".
  readonly label: string;
  // Waits between looks while the editor re-renders; a test passes one that doesn't wait.
  readonly sleep?: (ms: number) => Promise<void>;
  // How long the editor gets to show the text after each way.
  readonly settleMs?: number;
  readonly copy?: ((text: string) => Promise<boolean>) | undefined;
}

// Spaces and line breaks differ between editors (paragraphs, <br>s, non-breaking spaces), so
// the check compares the words alone.
export function sameText(shown: string, wanted: string): boolean {
  const squeeze = (text: string) => text.replace(/[\s ​﻿]+/g, "");
  return squeeze(shown) === squeeze(wanted);
}

function shownText(element: HTMLElement): string {
  return element.innerText ?? element.textContent ?? "";
}

function selectAll(element: HTMLElement): void {
  const doc = element.ownerDocument;
  element.focus();
  try {
    const range = doc.createRange();
    range.selectNodeContents(element);
    const selection = doc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  } catch {
    // An editor without a selection still takes the events below.
  }
}

function paste(element: HTMLElement, text: string): void {
  const view = element.ownerDocument.defaultView;
  const data = new (view?.DataTransfer ?? DataTransfer)();
  data.setData("text/plain", text);
  const Event_ = view?.Event ?? Event;
  const event = new Event_("paste", { bubbles: true, cancelable: true, composed: true });
  // ClipboardEvent's constructor drops clipboardData in some browsers; the property is set on
  // the event itself, which is what the editors read.
  Object.defineProperty(event, "clipboardData", { value: data });
  element.dispatchEvent(event);
}

function execInsert(element: HTMLElement, text: string): void {
  const doc = element.ownerDocument;
  if (typeof doc.execCommand !== "function") return;
  if (shownText(element).trim() !== "") doc.execCommand("delete", false);
  text.split(/\r?\n/).forEach((line, index) => {
    if (index > 0) doc.execCommand("insertLineBreak", false);
    if (line !== "") doc.execCommand("insertText", false, line);
  });
}

function beforeInput(element: HTMLElement, text: string): void {
  const view = element.ownerDocument.defaultView;
  const Input = view?.InputEvent ?? InputEvent;
  element.dispatchEvent(
    new Input("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: "insertText",
      data: text,
    }),
  );
}

async function settled(
  element: HTMLElement,
  text: string,
  sleep: (ms: number) => Promise<void>,
  settleMs: number,
): Promise<boolean> {
  for (let waited = 0; ; waited += 50) {
    if (sameText(shownText(element), text)) return true;
    if (waited >= settleMs) return false;
    await sleep(50);
  }
}

async function clipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function typeRich(
  element: HTMLElement,
  text: string,
  options: RichOptions,
): Promise<RichResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const settleMs = options.settleMs ?? 800;
  const ways = [
    ["paste", paste],
    ["execCommand", execInsert],
    ["beforeinput", beforeInput],
  ] as const;
  for (const [how, way] of ways) {
    selectAll(element);
    try {
      way(element, text);
    } catch {
      continue;
    }
    if (await settled(element, text, sleep, settleMs)) return { ok: true, how };
  }
  // Nothing half-typed stays in the box.
  selectAll(element);
  try {
    execInsert(element, "");
    if (shownText(element).trim() !== "") element.replaceChildren();
  } catch {
    element.replaceChildren();
  }
  const copied = await (options.copy ?? clipboard)(text);
  return {
    ok: false,
    copied,
    sentence: `Slopify couldn't type the post into ${options.label}: the site's editor didn't take it. ${copied ? "The text is copied: click the box and paste it (Ctrl+V, ⌘V on a Mac)." : "Press Copy, then click the box and paste it (Ctrl+V, ⌘V on a Mac)."}`,
  };
}

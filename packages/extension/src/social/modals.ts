import { labelOf } from "./find.js";
import type { SocialPlatform } from "./types.js";

// Prompts a site pops over its post form that change an account setting (TikTok's "Turn on
// automatic content checks?"). They are not the person's post, so the extension closes each
// with its Cancel and nothing else: never Turn on, Allow or Discard (those are refused anyway,
// `guard.ts`). An unknown prompt is left for the person.

export interface AccountPrompt {
  readonly site: SocialPlatform;
  // The prompt's own words, matched against the text of a dialog.
  readonly text: RegExp;
  // The one button pressed to close it, matched to its whole label.
  readonly cancel: RegExp;
  readonly checked: string | null;
}

export const accountPrompts: readonly AccountPrompt[] = [
  {
    site: "tiktok",
    text: /turn on automatic content checks\?/i,
    cancel: /^cancel$/i,
    checked: "2026-10-18",
  },
];

const dialogs = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog';

// Closes every known prompt showing now; answers the prompts it closed (their words). Where a
// prompt has no role=dialog box, its words' nearest block holding a Cancel counts as the box.
export function dismissPrompts(
  doc: Document,
  site: SocialPlatform,
  press: (element: Element) => void,
  prompts: readonly AccountPrompt[] = accountPrompts,
): readonly string[] {
  const closed: string[] = [];
  for (const prompt of prompts) {
    if (prompt.site !== site) continue;
    for (const box of boxesOf(doc, prompt.text)) {
      const cancel = [...box.querySelectorAll('button, [role="button"]')].find((button) =>
        prompt.cancel.test(labelOf(button)),
      );
      if (cancel === undefined) continue;
      press(cancel);
      closed.push(prompt.text.source);
    }
  }
  return closed;
}

function boxesOf(doc: Document, text: RegExp): readonly Element[] {
  const boxes = [...doc.querySelectorAll(dialogs)].filter((box) =>
    text.test((box.textContent ?? "").replace(/\s+/g, " ")),
  );
  if (boxes.length > 0) return boxes;
  const found: Element[] = [];
  const walker = doc.createTreeWalker(doc.body, 4);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!text.test((node.textContent ?? "").replace(/\s+/g, " "))) continue;
    let at = node.parentElement;
    for (let level = 0; at !== null && level < 8; level++, at = at.parentElement)
      if (at.querySelector('button, [role="button"]') !== null) {
        found.push(at);
        break;
      }
  }
  return found;
}

// Keeps closing the known prompts while a fill runs and for a while after (TikTok raises its
// prompt a few seconds after the video is in); answers a stop function.
export function watchPrompts(
  doc: Document,
  site: SocialPlatform,
  press: (element: Element) => void,
  onClosed: (prompt: string) => void,
): () => void {
  const view = doc.defaultView;
  if (view === null) return () => {};
  const look = () => {
    for (const prompt of dismissPrompts(doc, site, press)) onClosed(prompt);
  };
  const observer = new view.MutationObserver(look);
  observer.observe(doc.body, { childList: true, subtree: true });
  look();
  return () => observer.disconnect();
}

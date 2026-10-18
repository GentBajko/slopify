import { setFiles } from "../../fill.js";
import { findAllIn, findIn, missingOf, type SiteSelectors } from "../find.js";
import { siteMatches } from "../matches.js";
import { typeRich } from "../rich-text.js";
import {
  absolute,
  type FillContext,
  type Note,
  type Published,
  postText,
  type Site,
  type SiteReport,
  setTextValue,
  startsLike,
  typedNote,
  until,
} from "../site.js";

// Bluesky (bsky.app). Its composer opens over the feed from "Compose new post"; the text box is a
// Tiptap/ProseMirror editor (300 graphemes, which Slopify fits), the pictures (up to 4) or the one
// video go into the hidden file input behind "Add media to post", which is never clicked (it
// opens the system's file picker). Bluesky has no scheduler and no AI label: Slopify fills the
// post at its release time and the person presses Publish. Seen on 2026-10-18, read-only.

const selectors = {
  compose: {
    label: 'the "Compose new post" button',
    selectors: ['button[aria-label="Compose new post"]', '[aria-label="New post"]'],
    checked: "2026-10-18",
  },
  composer: {
    label: "the post composer",
    selectors: ['[data-testid="composePostView"]'],
    checked: "2026-10-18",
  },
  text: {
    label: "the post's text box",
    selectors: [
      '[data-testid="composePostView"] .tiptap.ProseMirror[contenteditable="true"]',
      '[data-testid="composePostView"] [contenteditable="true"]',
    ],
    checked: "2026-10-18",
  },
  media: {
    label: "the media input behind Add media to post",
    selectors: [
      '[data-testid="composePostView"] input[type="file"]',
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ],
    checked: null,
  },
  // Alt text boxes, when Bluesky shows them beside the attached pictures.
  alt: {
    label: "the pictures' alt text boxes",
    selectors: [
      '[data-testid="composePostView"] textarea[aria-label*="alt" i]',
      '[data-testid="composePostView"] input[aria-label*="alt" i]',
      'textarea[placeholder*="alt text" i]',
    ],
    checked: null,
  },
  // The "published" toast and the post's link in it.
  toast: {
    label: "the published toast",
    selectors: ['[role="alert"]', '[role="status"]', '[data-testid*="toast" i]'],
    text: /\b(post|your post)\b.*\b(published|sent)\b/i,
    checked: null,
  },
  feedItem: {
    label: "a post on the profile",
    selectors: ['[data-testid^="feedItem-by-"]', '[data-testid*="postThreadItem"]', "article"],
    checked: null,
  },
} satisfies Record<string, SiteSelectors>;

async function fill(context: FillContext): Promise<SiteReport> {
  const { doc, pack, files, waits, press } = context;
  await until(waits, () => findIn(doc, selectors.composer) ?? findIn(doc, selectors.compose));
  if (findIn(doc, selectors.composer) === null) {
    const open = findIn(doc, selectors.compose);
    if (open === null)
      return { filled: false, missing: [selectors.compose.label, selectors.text.label], notes: [] };
    press(open);
    await until(waits, () => findIn(doc, selectors.composer));
  }
  const text = postText(pack);
  const needed: SiteSelectors[] = [selectors.composer];
  if (text !== "") needed.push(selectors.text);
  if (files.length > 0) needed.push(selectors.media);
  const missing = missingOf(doc, needed);
  if (missing.length > 0) return { filled: false, missing, notes: [] };

  const notes: Note[] = [];
  if (text !== "") {
    const box = findIn(doc, selectors.text) as HTMLElement;
    notes.push(
      typedNote(
        await typeRich(box, text, {
          label: selectors.text.label,
          sleep: waits.sleep,
          copy: context.copy,
        }),
        text,
      ),
    );
  }
  if (files.length > 0) {
    setFiles(findIn(doc, selectors.media) as HTMLInputElement, files);
    notes.push({ ok: true, message: `Media added (${String(files.length)}).` });
    const alts = pack.media.map((media) => media.alt ?? "");
    if (alts.some((alt) => alt !== "")) notes.push(await altTexts(context, alts));
  }
  return { filled: true, notes, scheduled: false };
}

async function altTexts(context: FillContext, alts: readonly string[]): Promise<Note> {
  const boxes = await until(context.waits, () => {
    const found = findAllIn(context.doc, selectors.alt);
    return found.length > 0 ? found : null;
  });
  if (boxes === null)
    return {
      ok: false,
      message:
        "Slopify didn't find Bluesky's alt text boxes. Press ALT on each picture and paste its text (Copy has them, one per line).",
      copy: alts.join("\n"),
    };
  alts.forEach((alt, index) => {
    const box = boxes[index];
    if (box !== undefined && alt !== "") setTextValue(box as HTMLTextAreaElement, alt);
  });
  return { ok: true, message: "Alt text filled." };
}

function published(doc: Document, location: URL): Published | null {
  const toast = findIn(doc, selectors.toast);
  if (toast === null) return null;
  const link = absolute(toast.querySelector('a[href*="/post/"]'), location);
  return { state: "posted", ...(link === null ? {} : { url: link }) };
}

function findLink(doc: Document, location: URL, start: string): string | null {
  for (const item of findAllIn(doc, selectors.feedItem))
    if (startsLike(item.textContent ?? "", start)) {
      const link = absolute(item.querySelector('a[href*="/post/"]'), location);
      if (link !== null) return link.replace(/[?#].*$/, "");
    }
  return null;
}

export const bluesky: Site = {
  platform: "bluesky",
  matches: siteMatches.bluesky,
  selectors,
  forbidden: { selectors: ['[data-testid="composerPublishBtn"]'], labels: [] },
  isCompose: (location) => location.pathname === "/",
  fill,
  published,
  findLink,
};

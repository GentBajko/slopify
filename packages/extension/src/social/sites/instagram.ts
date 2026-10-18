import { setFiles } from "../../fill.js";
import { findAllIn, findIn, labelOf, missingOf, type SiteSelectors, switchNear } from "../find.js";
import { RefusedClick } from "../guard.js";
import { siteMatches } from "../matches.js";
import { typeRich } from "../rich-text.js";
import {
  absolute,
  aiLabelByHand,
  type FillContext,
  mediaFiles,
  type Note,
  type Published,
  pictureKinds,
  postText,
  type Site,
  type SiteReport,
  setTextValue,
  startsLike,
  switchOn,
  typedNote,
  until,
  videoKinds,
} from "../site.js";

// Instagram (www.instagram.com). Seen on 2026-10-18 with a grey test picture, discarded, never
// shared: the sidebar's Create ("New post") opens "Create new post", whose file input takes the
// pictures (a carousel) or a video; then Crop ("Select crop": Original | 1:1 | 4:5 | 16:9) →
// Next → Edit → Next → the caption step: the caption box (2,200 characters), "Add AI label",
// and Accessibility's "Write alt text..." per picture. Share and "Discard post?"'s Discard are
// never pressed. Instagram has no scheduler on the web: Slopify fills the post at its release
// time and the person presses Share.

const selectors = {
  create: {
    label: 'the sidebar\'s "Create" (New post)',
    selectors: ['svg[aria-label="New post"]', '[aria-label="New post"]'],
    checked: "2026-10-18",
  },
  input: {
    label: 'the "Create new post" file input',
    selectors: [
      '[role="dialog"] input[type="file"]',
      'form[enctype="multipart/form-data"] input[type="file"]',
      'input[type="file"][accept*="image"]',
    ],
    checked: "2026-10-18",
  },
  crop: {
    label: 'the "Select crop" button',
    selectors: ['[role="dialog"] svg[aria-label="Select crop"]', '[aria-label="Select crop"]'],
    checked: "2026-10-18",
  },
  cropChoice: {
    label: "the crop choices",
    selectors: [
      '[role="dialog"] [role="button"]',
      '[role="dialog"] button',
      '[role="dialog"] span',
    ],
    checked: "2026-10-18",
  },
  next: {
    label: "Next",
    selectors: ['[role="dialog"] [role="button"]', '[role="dialog"] button'],
    text: /^next$/i,
    checked: "2026-10-18",
  },
  // "Video posts are now shared as reels", with OK, before the crop step of a video.
  reelsNotice: {
    label: "the reels notice's OK",
    selectors: ['[role="dialog"] button', '[role="dialog"] [role="button"]'],
    text: /^ok$/i,
    checked: null,
  },
  caption: {
    label: "the caption box",
    selectors: [
      'div[role="textbox"][aria-label="Add a caption..."]',
      'div[role="textbox"][aria-label^="Write a caption"]',
      '[role="dialog"] div[contenteditable="true"][role="textbox"]',
    ],
    checked: "2026-10-18",
  },
  accessibility: {
    label: "Accessibility",
    selectors: ['[role="dialog"] [role="button"]', '[role="dialog"] button', '[role="dialog"] div'],
    text: /^accessibility$/i,
    checked: "2026-10-18",
  },
  alt: {
    label: "the alt text boxes",
    selectors: [
      'input[placeholder="Write alt text..."]',
      'textarea[placeholder="Write alt text..."]',
    ],
    checked: "2026-10-18",
  },
  shared: {
    label: "the shared message",
    selectors: ['[role="dialog"]', "h1, h2, h3, span"],
    text: /your (post|reel) has been shared/i,
    checked: null,
  },
  profilePost: {
    label: "a post on the profile",
    selectors: ['a[href*="/p/"]', 'a[href*="/reel/"]'],
    checked: null,
  },
} satisfies Record<string, SiteSelectors>;

const aiLabel = /^add ai label$/i;
const crops: Readonly<Record<string, RegExp>> = {
  "4:5": /^4:5$/,
  "1:1": /^1:1$/,
  "16:9": /^16:9$/,
  original: /^original$/i,
  "9:16": /^original$/i,
};

const clickable = (element: Element) =>
  element.closest('[role="button"], button, a, [role="link"]') ?? element;

async function fill(context: FillContext): Promise<SiteReport> {
  const { doc, pack, files, waits, press } = context;
  const videos = mediaFiles(pack, files, videoKinds);
  const pictures = mediaFiles(pack, files, pictureKinds);
  const chosen = videos.length > 0 ? videos.slice(0, 1) : pictures;
  if (chosen.length === 0)
    return {
      filled: false,
      missing: [],
      notes: [
        {
          ok: false,
          message:
            "An Instagram post needs pictures or a video, and this one has none. Pick pictures or the short for Instagram in Slopify's Prepare upload, then press Fill in Instagram again.",
        },
      ],
    };

  // Create new post (the sidebar renders a moment after the page).
  await until(waits, () => findIn(doc, selectors.input) ?? findIn(doc, selectors.create));
  if (findIn(doc, selectors.input) === null) {
    const create = findIn(doc, selectors.create);
    if (create === null) return { filled: false, missing: [selectors.create.label], notes: [] };
    press(clickable(create));
  }
  const input = await until(waits, () => findIn(doc, selectors.input));
  if (input === null) return { filled: false, missing: [selectors.input.label], notes: [] };
  setFiles(
    input as HTMLInputElement,
    chosen.map((one) => one.file),
  );
  const notes: Note[] = [
    {
      ok: true,
      message:
        videos.length > 0
          ? `Added ${chosen[0]?.media.filename ?? "the video"}.`
          : `Added ${String(chosen.length)} picture${chosen.length === 1 ? "" : "s"}.`,
    },
  ];

  // Crop, then Next until the caption step (Crop → Edit → caption).
  const reels = findIn(doc, selectors.reelsNotice);
  if (reels !== null) press(reels);
  notes.push(await crop(context, chosen[0]?.media.shape ?? "original"));
  for (let step = 0; step < 4 && findIn(doc, selectors.caption) === null; step++) {
    const next = await until(waits, () => findIn(doc, selectors.next));
    if (next === null) break;
    press(next);
    await until(
      waits,
      () => findIn(doc, selectors.caption) ?? (findIn(doc, selectors.next) === next ? null : true),
    );
  }
  const missing = missingOf(doc, [selectors.caption]);
  if (missing.length > 0)
    return {
      filled: false,
      missing,
      notes: [
        ...notes,
        {
          ok: false,
          message:
            "Instagram's caption step didn't appear, so no text was filled. Press Next yourself and paste the caption (Copy has it).",
          copy: postText(pack),
        },
      ],
    };

  const text = postText(pack);
  if (text !== "")
    notes.push(
      typedNote(
        await typeRich(findIn(doc, selectors.caption) as HTMLElement, text, {
          label: selectors.caption.label,
          sleep: waits.sleep,
          copy: context.copy,
        }),
        text,
      ),
    );
  if (pack.aiLabel) notes.push(await aiSwitch(context));
  const alts = chosen.map((one) => one.media.alt ?? "");
  if (videos.length === 0 && alts.some((alt) => alt !== ""))
    notes.push(await altTexts(context, alts));
  return { filled: true, notes, scheduled: false };
}

async function crop(context: FillContext, shape: string): Promise<Note> {
  const { doc, waits, press } = context;
  const wanted = crops[shape] ?? crops.original;
  const button = await until(waits, () => findIn(doc, selectors.crop));
  if (button === null || wanted === undefined)
    return {
      ok: false,
      message: "Slopify didn't find Instagram's crop choices; check the crop before Next.",
    };
  press(clickable(button));
  const choice = await until(waits, () =>
    findAllIn(doc, selectors.cropChoice).find((one) => wanted.test(labelOf(one))),
  );
  if (choice === undefined || choice === null)
    return {
      ok: false,
      message: `Slopify didn't find Instagram's ${shape} crop; choose it yourself under the crop button before sharing.`,
    };
  press(clickable(choice));
  return { ok: true, message: `Crop set to ${labelOf(choice)}.` };
}

async function aiSwitch(context: FillContext): Promise<Note> {
  const { doc, waits, press } = context;
  const where = "Add AI label, under the caption";
  try {
    const control = await until(waits, () => switchNear(doc, aiLabel));
    if (control === null) return aiLabelByHand("Instagram", where);
    return (await switchOn(waits, press, control))
      ? { ok: true, message: "AI label switched on." }
      : aiLabelByHand("Instagram", where);
  } catch (error) {
    if (error instanceof RefusedClick) return aiLabelByHand("Instagram", where);
    throw error;
  }
}

async function altTexts(context: FillContext, alts: readonly string[]): Promise<Note> {
  const { doc, waits, press } = context;
  if (findAllIn(doc, selectors.alt).length === 0) {
    const open = findIn(doc, selectors.accessibility);
    if (open !== null) press(clickable(open));
  }
  const boxes = await until(waits, () => {
    const found = findAllIn(doc, selectors.alt);
    return found.length > 0 ? found : null;
  });
  if (boxes === null)
    return {
      ok: false,
      message:
        "Slopify didn't find Instagram's alt text boxes. Open Accessibility under the caption and paste each picture's text (Copy has them, one per line).",
      copy: alts.join("\n"),
    };
  alts.forEach((alt, index) => {
    const box = boxes[index];
    if (box !== undefined && alt !== "") setTextValue(box as HTMLInputElement, alt);
  });
  return { ok: true, message: "Alt text filled." };
}

function published(doc: Document): Published | null {
  return findIn(doc, selectors.shared) === null ? null : { state: "posted" };
}

function findLink(doc: Document, location: URL, start: string): string | null {
  for (const anchor of findAllIn(doc, selectors.profilePost)) {
    const words = [
      anchor.textContent ?? "",
      ...[...anchor.querySelectorAll("img[alt]")].map((img) => img.getAttribute("alt") ?? ""),
    ].join(" ");
    if (!startsLike(words, start)) continue;
    const link = absolute(anchor, location);
    if (link !== null) return link.replace(/[?#].*$/, "");
  }
  return null;
}

export const instagram: Site = {
  platform: "instagram",
  matches: siteMatches.instagram,
  selectors,
  // The dialog's close (X) leads to "Discard post?".
  forbidden: {
    selectors: ['[role="button"][aria-label="Close"]', 'svg[aria-label="Close"]'],
    labels: [],
  },
  isCompose: (location) => location.pathname === "/",
  fill,
  published,
  findLink,
};

import { setFiles } from "../../fill.js";
import { findAllIn, findIn, labelOf, missingOf, type SiteSelectors } from "../find.js";
import { RefusedClick } from "../guard.js";
import { typeRich } from "../rich-text.js";
import {
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

// Reddit (www.reddit.com/r/<subreddit>/submit). NOT SEEN on the live site: Claude in Chrome
// refuses reddit.com, so every selector here is checked: null and needs a live check by the
// person (docs/studio-extension.md). Slopify opens the submit page with the title, the text or
// the link in its address (`redditSubmitUrl` in the app); this fills whatever the page didn't
// take, the media on the Images & Video tab and the flair, searching inside Reddit's web
// components' open shadow roots. Post is never pressed.

const selectors = {
  title: {
    label: "the Title box",
    selectors: [
      'textarea[name="title"]',
      'input[name="title"]',
      'faceplate-textarea-input[name="title"] textarea',
    ],
    shadow: true,
    checked: null,
  },
  body: {
    label: "the Body box",
    selectors: [
      'shreddit-composer [contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea[name="text"]',
    ],
    shadow: true,
    checked: null,
  },
  link: {
    label: "the Link box",
    selectors: [
      'textarea[name="link"]',
      'input[name="link"]',
      'faceplate-textarea-input[name="link"] textarea',
    ],
    shadow: true,
    checked: null,
  },
  tab: {
    label: "the post type tabs",
    selectors: ['[role="tab"]', "button"],
    shadow: true,
    checked: null,
  },
  media: {
    label: "the Images & Video input",
    selectors: ['input[type="file"]'],
    shadow: true,
    checked: null,
  },
  flair: {
    label: '"Add flair and tags"',
    selectors: ["button", '[role="button"]'],
    text: /^add flair/i,
    shadow: true,
    checked: null,
  },
  flairChoice: {
    label: "the flair choices",
    selectors: ['[role="radio"]', 'input[type="radio"]', "label", "faceplate-radio-input"],
    shadow: true,
    checked: null,
  },
  flairApply: {
    label: "the flair's Add",
    selectors: ["button", '[role="button"]'],
    text: /^(add|apply)$/i,
    shadow: true,
    checked: null,
  },
  post: {
    label: "a post on the profile",
    selectors: ["shreddit-post[permalink]", "article"],
    checked: null,
  },
} satisfies Record<string, SiteSelectors>;

const tabs = { text: /^text$/i, media: /^images?\s*(&|and)\s*video$/i, link: /^link$/i } as const;

async function openTab(context: FillContext, name: RegExp): Promise<void> {
  const tab = findAllIn(context.doc, selectors.tab).find((one) => name.test(labelOf(one)));
  if (tab !== undefined && tab.getAttribute("aria-selected") !== "true") {
    context.press(tab);
    await context.waits.sleep(100);
  }
}

async function fill(context: FillContext): Promise<SiteReport> {
  const { doc, pack, files, waits } = context;
  const reddit = pack.reddit;
  const kind = reddit?.kind ?? (files.length > 0 ? "media" : pack.link !== null ? "link" : "text");
  const notes: Note[] = [];
  if (reddit === undefined || reddit.subreddit === "")
    notes.push({
      ok: false,
      message:
        "This post has no subreddit. Choose the community at the top of Reddit's form, or set it under the Reddit post in Slopify's Prepare upload.",
    });

  await until(waits, () => findIn(doc, selectors.title));
  if (kind !== "text")
    await openTab(context, kind === "media" ? tabs.media : tabs.link).catch(() => undefined);
  const needed: SiteSelectors[] = [selectors.title];
  const text = postText(pack);
  if (kind === "text" && text !== "") needed.push(selectors.body);
  if (kind === "link" && pack.link !== null) needed.push(selectors.link);
  if (kind === "media" && files.length > 0) {
    await until(waits, () => findIn(doc, selectors.media));
    needed.push(selectors.media);
  }
  const missing = missingOf(doc, needed);
  if (missing.length > 0) return { filled: false, missing, notes };

  const title = findIn(doc, selectors.title) as HTMLTextAreaElement;
  const wantedTitle = reddit?.title ?? pack.projectTitle;
  if (title.value.trim() === "" && wantedTitle !== "") setTextValue(title, wantedTitle);
  notes.push(
    title.value.trim() === ""
      ? {
          ok: false,
          message: "This post has no title; Reddit needs one. Type it in Title.",
          copy: wantedTitle,
        }
      : { ok: true, message: "Title filled." },
  );
  if (kind === "text" && text !== "") {
    const body = findIn(doc, selectors.body) as HTMLElement;
    const shown = body instanceof HTMLTextAreaElement ? body.value : (body.textContent ?? "");
    if (shown.trim() === "")
      notes.push(
        typedNote(
          body instanceof HTMLTextAreaElement
            ? setTextValue(body, text)
              ? { ok: true }
              : {
                  ok: false,
                  sentence: "Reddit didn't take the text. Paste it in Body (Copy has it).",
                }
            : await typeRich(body, text, {
                label: selectors.body.label,
                sleep: waits.sleep,
                copy: context.copy,
              }),
          text,
        ),
      );
  }
  if (kind === "link" && pack.link !== null) {
    const link = findIn(doc, selectors.link) as HTMLTextAreaElement;
    if (link.value.trim() === "") setTextValue(link, pack.link);
    notes.push({ ok: true, message: "Link filled." });
  }
  if (kind === "media" && files.length > 0) {
    setFiles(findIn(doc, selectors.media) as HTMLInputElement, files);
    notes.push({ ok: true, message: `Media added (${String(files.length)}).` });
  }
  if (reddit !== undefined && reddit.flair.trim() !== "")
    notes.push(await flair(context, reddit.flair));
  return { filled: true, notes, scheduled: false };
}

async function flair(context: FillContext, name: string): Promise<Note> {
  const { doc, waits, press } = context;
  const byHand: Note = {
    ok: false,
    message: `Slopify couldn't pick the flair "${name}". Press Add flair and tags and pick it yourself.`,
    copy: name,
  };
  try {
    const open = findIn(doc, selectors.flair);
    if (open === null) return byHand;
    press(open);
    const wanted = name.trim().toLowerCase();
    const choice = await until(waits, () =>
      findAllIn(doc, selectors.flairChoice).find((one) => labelOf(one).toLowerCase() === wanted),
    );
    if (choice === null || choice === undefined) return byHand;
    press(choice);
    const apply = findIn(doc, selectors.flairApply);
    if (apply !== null) press(apply);
    return { ok: true, message: `Flair set to ${name}.` };
  } catch (error) {
    if (error instanceof RefusedClick) return byHand;
    throw error;
  }
}

function published(_doc: Document, location: URL): Published | null {
  const post = /^\/r\/[A-Za-z0-9_]+\/comments\/[a-z0-9]+(?:\/[^/?#]*)?/.exec(location.pathname);
  return post === null ? null : { state: "posted", url: `https://www.reddit.com${post[0]}` };
}

function findLink(doc: Document, _location: URL, start: string): string | null {
  for (const post of findAllIn(doc, selectors.post)) {
    const words = `${post.getAttribute("post-title") ?? ""} ${post.textContent ?? ""}`;
    if (!startsLike(words, start)) continue;
    const permalink = post.getAttribute("permalink");
    if (permalink !== null) return new URL(permalink, "https://www.reddit.com").toString();
  }
  return null;
}

export const reddit: Site = {
  platform: "reddit",
  matches: ["https://www.reddit.com/*"],
  selectors,
  forbidden: {
    selectors: ["#submit-post-button", '[slot="submit-button"]', "#inner-post-submit-button"],
    labels: [/^save draft$/i],
  },
  isCompose: (location) => /\/submit\/?$/.test(location.pathname),
  fill,
  published,
  findLink,
};

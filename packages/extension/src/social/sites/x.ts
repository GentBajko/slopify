import { setFiles } from "../../fill.js";
import { findAllIn, findIn, isOn, labelOf, missingOf, type SiteSelectors } from "../find.js";
import { RefusedClick } from "../guard.js";
import { siteMatches } from "../matches.js";
import { typeRich } from "../rich-text.js";
import {
  absolute,
  aiLabelByHand,
  type FillContext,
  localTime,
  type Note,
  type Published,
  postText,
  type Site,
  type SiteReport,
  scheduleByHand,
  setSelect,
  startsLike,
  typedNote,
  until,
} from "../site.js";

// X (x.com/compose/post). Seen on 2026-10-18, read-only: the composer dialog's Draft.js text box
// (`tweetTextarea_0`), the media input (`fileInput`, images and videos, several), and the
// toolbar's "Schedule post" and "Content disclosure". The schedule dialog's pickers and the
// disclosure's choices were not opened: they follow X's web app (selects named Month, Day,
// Year, Hour, Minute and AM/PM, and a Confirm that only sets the time). Post (`tweetButton`),
// which reads Schedule once a time is set, is never pressed.

const selectors = {
  text: {
    label: "the post's text box",
    selectors: [
      '[data-testid="tweetTextarea_0"][contenteditable="true"]',
      '[data-testid="tweetTextarea_0"] [contenteditable="true"]',
      'div[role="textbox"][aria-label="Post text"]',
    ],
    checked: "2026-10-18",
  },
  media: {
    label: "the media input",
    selectors: ['input[type="file"][data-testid="fileInput"]'],
    checked: "2026-10-18",
  },
  schedule: {
    label: 'the "Schedule post" button',
    selectors: ['[data-testid="scheduleOption"]', 'button[aria-label="Schedule post"]'],
    checked: "2026-10-18",
  },
  scheduleDialog: {
    label: "the schedule dialog",
    selectors: ['[role="dialog"] [data-testid="scheduledConfirmationPrimaryAction"]'],
    checked: null,
  },
  scheduleSelects: {
    label: "the schedule's date and time pickers",
    selectors: ['[role="dialog"] select'],
    checked: null,
  },
  confirm: {
    label: "the schedule's Confirm button",
    selectors: [
      '[data-testid="scheduledConfirmationPrimaryAction"]',
      '[role="dialog"] button',
      '[role="dialog"] [role="button"]',
    ],
    text: /^confirm$/i,
    checked: null,
  },
  disclosure: {
    label: 'the "Content disclosure" button',
    selectors: ['[data-testid="contentDisclosureButton"]', '[aria-label="Content disclosure"]'],
    checked: "2026-10-18",
  },
  aiChoice: {
    label: "the AI-generated disclosure",
    selectors: [
      '[role="menuitemcheckbox"]',
      '[role="menuitem"]',
      '[role="checkbox"]',
      '[role="switch"]',
      '[role="radio"]',
      'input[type="checkbox"]',
      "label",
    ],
    text: /\b(ai|a\.i\.)\b|generated|synthetic/i,
    checked: null,
  },
  disclosureDone: {
    label: "the disclosure's Done button",
    selectors: [
      '[role="dialog"] button',
      '[role="menu"] button',
      '[role="dialog"] [role="button"]',
    ],
    text: /^(done|apply)$/i,
    checked: null,
  },
  toast: {
    label: "X's toast",
    selectors: ['[data-testid="toast"]', '[role="alert"]'],
    checked: null,
  },
  tweet: {
    label: "a post on the profile",
    selectors: ['article[data-testid="tweet"]', "article"],
    checked: null,
  },
} satisfies Record<string, SiteSelectors>;

async function fill(context: FillContext): Promise<SiteReport> {
  const { doc, pack, files, waits } = context;
  const text = postText(pack);
  await until(waits, () => findIn(doc, selectors.text));
  const needed: SiteSelectors[] = [];
  if (text !== "") needed.push(selectors.text);
  if (files.length > 0) needed.push(selectors.media);
  const missing = missingOf(doc, needed);
  if (missing.length > 0) return { filled: false, missing, notes: [] };

  const notes: Note[] = [];
  if (text !== "")
    notes.push(
      typedNote(
        await typeRich(findIn(doc, selectors.text) as HTMLElement, text, {
          label: selectors.text.label,
          sleep: waits.sleep,
          copy: context.copy,
        }),
        text,
      ),
    );
  if (files.length > 0) {
    setFiles(findIn(doc, selectors.media) as HTMLInputElement, files);
    notes.push({ ok: true, message: `Media added (${String(files.length)}).` });
  }
  if (pack.aiLabel) notes.push(await aiDisclosure(context));
  let scheduled = false;
  if (pack.schedule.mode === "native" && pack.schedule.at !== null) {
    const note = await schedule(context, pack.schedule.at);
    scheduled = note.ok;
    notes.push(note);
  }
  return { filled: true, notes, scheduled };
}

// Content disclosure → the AI choice. Not seen on the live site yet: if the choice isn't there,
// a sentence says so and nothing else is pressed.
async function aiDisclosure(context: FillContext): Promise<Note> {
  const { doc, waits, press } = context;
  const where = "Content disclosure, under the post box";
  const button = findIn(doc, selectors.disclosure);
  if (button === null) return aiLabelByHand("X", where);
  // Only a choice the button brought up counts, not the composer's other AI controls.
  const before = new Set(findAllIn(doc, selectors.aiChoice));
  try {
    press(button);
    const choice = await until(waits, () =>
      findAllIn(doc, selectors.aiChoice).find((one) => !before.has(one)),
    );
    if (choice === null) {
      closeMenu(doc);
      return aiLabelByHand("X", where);
    }
    if (!isOn(choice)) press(choice);
    const done = findIn(doc, selectors.disclosureDone);
    if (done !== null) press(done);
    return { ok: true, message: `AI disclosure set (${labelOf(choice)}).` };
  } catch (error) {
    if (!(error instanceof RefusedClick)) throw error;
    closeMenu(doc);
    return aiLabelByHand("X", where);
  }
}

function closeMenu(doc: Document): void {
  const view = doc.defaultView;
  doc.activeElement?.dispatchEvent(
    new (view?.KeyboardEvent ?? KeyboardEvent)("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
    }),
  );
}

// The select whose label (its aria-label, its <label>, or the text just before it) matches.
function selectNamed(selects: readonly Element[], name: RegExp): HTMLSelectElement | undefined {
  return selects.find((select) => {
    const id = select.getAttribute("id");
    const label =
      select.getAttribute("aria-label") ??
      (id === null
        ? null
        : select.ownerDocument.querySelector(`label[for="${id}"]`)?.textContent) ??
      select.parentElement?.textContent ??
      "";
    return name.test(label);
  }) as HTMLSelectElement | undefined;
}

async function schedule(context: FillContext, iso: string): Promise<Note> {
  const { doc, waits, press } = context;
  const button = findIn(doc, selectors.schedule);
  if (button === null)
    return scheduleByHand("X", iso, "Slopify didn't find X's Schedule post button.");
  press(button);
  const selects = await until(waits, () => {
    const found = findAllIn(doc, selectors.scheduleSelects);
    return found.length >= 5 ? found : null;
  });
  const time = localTime(iso);
  const twelveHour = selects !== null && selectNamed(selects, /am\s*\/\s*pm/i) !== undefined;
  const wanted: readonly [RegExp, string][] = [
    [/month/i, String(time.month)],
    [/day/i, String(time.day)],
    [/year/i, String(time.year)],
    [/hour/i, String(twelveHour ? time.hour12 : time.hour)],
    [/minute/i, String(time.minute)],
    ...(twelveHour ? [[/am\s*\/\s*pm/i, time.meridiem] as [RegExp, string]] : []),
  ];
  const set =
    selects !== null &&
    wanted.every(([name, value]) => {
      const select = selectNamed(selects, name);
      return (
        select !== undefined &&
        (setSelect(select, value) || setSelect(select, value.padStart(2, "0")))
      );
    });
  if (!set) {
    closeMenu(doc);
    return scheduleByHand("X", iso, "Slopify couldn't set the date and time in X's schedule.");
  }
  const confirm = findIn(doc, selectors.confirm);
  if (confirm === null) {
    closeMenu(doc);
    return scheduleByHand("X", iso, "Slopify didn't find the schedule's Confirm button.");
  }
  press(confirm);
  return {
    ok: true,
    message: `Scheduled for ${time.said} in X's schedule. Press Schedule when the post looks right.`,
  };
}

function published(doc: Document, location: URL): Published | null {
  for (const toast of findAllIn(doc, selectors.toast)) {
    const words = toast.textContent ?? "";
    if (/your post was sent/i.test(words)) {
      const link = absolute(toast.querySelector('a[href*="/status/"]'), location);
      return { state: "posted", ...(link === null ? {} : { url: link }) };
    }
    if (/will be sent on|scheduled/i.test(words)) return { state: "scheduled" };
  }
  return null;
}

function findLink(doc: Document, location: URL, start: string): string | null {
  for (const tweet of findAllIn(doc, selectors.tweet)) {
    if (!startsLike(tweet.textContent ?? "", start)) continue;
    const anchor =
      tweet.querySelector('a[href*="/status/"] time')?.closest("a") ??
      tweet.querySelector('a[href*="/status/"]');
    const link = absolute(anchor, location);
    const status = link === null ? null : /^https:\/\/[^/]+\/[^/]+\/status\/\d+/.exec(link);
    if (status !== null) return status[0];
  }
  return null;
}

export const x: Site = {
  platform: "x",
  matches: siteMatches.x,
  selectors,
  forbidden: {
    selectors: [
      '[data-testid="tweetButton"]',
      '[data-testid="tweetButtonInline"]',
      '[data-testid="app-bar-close"]',
      '[data-testid="unsentButton"]',
    ],
    labels: [],
  },
  isCompose: (location) => /^\/compose\/(post|tweet)\/?$/.test(location.pathname),
  fill,
  published,
  findLink,
};

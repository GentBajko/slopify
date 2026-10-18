import { setFiles } from "../../fill.js";
import { findAllIn, findIn, missingOf, type SiteSelectors } from "../find.js";
import { RefusedClick } from "../guard.js";
import { siteMatches } from "../matches.js";
import { typeRich } from "../rich-text.js";
import {
  type FillContext,
  localTime,
  type Note,
  type Published,
  postText,
  type Site,
  type SiteReport,
  scheduleByHand,
  setSelect,
  setTextValue,
  startsLike,
  typedNote,
  until,
} from "../site.js";

// LinkedIn (www.linkedin.com/feed/?shareActive=true). Seen on 2026-10-18, read-only: the share
// dialog's Tiptap/ProseMirror text box (no aria-label), "Media" (which opens the system's file
// picker and is never clicked), "Scheduled" (the clock) and Post. LinkedIn's page is
// server-driven with hashed class names, so controls are found by role, label and text. The
// share box's own file input, the media editor's Next, the schedule step's date and time and its
// Next were not seen: when one isn't there, a sentence says what to do by hand. Post and the
// schedule's final Schedule are never pressed; the schedule step's Next only sets the time.

const selectors = {
  startPost: {
    label: '"Start a post"',
    selectors: ["button", '[role="button"]'],
    text: /^start a post$/i,
    checked: null,
  },
  text: {
    label: "the post's text box",
    selectors: [
      '.tiptap.ProseMirror[contenteditable="true"]',
      '.ql-editor[contenteditable="true"]',
      '[role="dialog"] [contenteditable="true"][role="textbox"]',
    ],
    checked: "2026-10-18",
  },
  media: {
    label: "the share box's file input",
    selectors: ['[role="dialog"] input[type="file"]', '.share-box input[type="file"]'],
    checked: null,
  },
  // The media editor LinkedIn shows after a file: its Next (or Done) goes back to the post.
  mediaNext: {
    label: "the media editor's Next",
    selectors: ['[role="dialog"] button'],
    text: /^(next|done)$/i,
    checked: null,
  },
  schedule: {
    label: 'the "Schedule post" clock',
    selectors: [
      'button[aria-label="Schedule post"]',
      'button[aria-label^="Schedul"]',
      '[role="dialog"] button',
    ],
    text: /^schedul(ed|e post)/i,
    checked: "2026-10-18",
  },
  scheduleDate: {
    label: "the schedule's date",
    selectors: [
      'input[name*="date" i]',
      'input[id*="date" i]',
      'input[aria-label*="date" i]',
      'input[placeholder*="dd" i]',
    ],
    checked: null,
  },
  scheduleTime: {
    label: "the schedule's time",
    selectors: [
      'select[name*="time" i]',
      'select[id*="time" i]',
      'input[name*="time" i]',
      'input[id*="time" i]',
      'input[aria-label*="time" i]',
    ],
    checked: null,
  },
  scheduleNext: {
    label: "the schedule's Next",
    selectors: ['[role="dialog"] button'],
    text: /^next$/i,
    checked: null,
  },
  success: {
    label: "the posted message",
    selectors: ['[role="alert"]', '[role="status"]', ".artdeco-toast-item", "div"],
    text: /post successful|your post (is|was) (scheduled|shared)/i,
    checked: null,
  },
  update: {
    label: "a post on the profile",
    selectors: ['[data-urn^="urn:li:activity:"]', '[data-id^="urn:li:activity:"]'],
    checked: null,
  },
} satisfies Record<string, SiteSelectors>;

// LinkedIn's date box in the browser's own order (12/31/2026 or 31/12/2026).
function dateFor(field: HTMLInputElement, time: ReturnType<typeof localTime>): string {
  if (field.type === "date") return time.date;
  const two = (value: number) => String(value).padStart(2, "0");
  const order = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date(time.year, time.month - 1, time.day))
    .filter((part) => part.type !== "literal")
    .map((part) => part.type);
  const parts: Record<string, string> = {
    day: two(time.day),
    month: two(time.month),
    year: String(time.year),
  };
  return order.map((part) => parts[part] ?? "").join("/");
}

async function fill(context: FillContext): Promise<SiteReport> {
  const { doc, pack, files, waits, press } = context;
  let box = await until(waits, () => findIn(doc, selectors.text));
  if (box === null) {
    const start = findIn(doc, selectors.startPost);
    if (start !== null) {
      press(start);
      box = await until(waits, () => findIn(doc, selectors.text));
    }
  }
  const text = postText(pack);
  const missing = missingOf(doc, text === "" ? [] : [selectors.text]);
  if (missing.length > 0) return { filled: false, missing, notes: [] };

  const notes: Note[] = [];
  if (files.length > 0) notes.push(await addMedia(context));
  if (text !== "") {
    box = findIn(doc, selectors.text) ?? box;
    notes.push(
      typedNote(
        await typeRich(box as HTMLElement, text, {
          label: selectors.text.label,
          sleep: waits.sleep,
          copy: context.copy,
        }),
        text,
      ),
    );
  }
  let scheduled = false;
  if (pack.schedule.mode === "native" && pack.schedule.at !== null) {
    const note = await schedule(context, pack.schedule.at);
    scheduled = note.ok;
    notes.push(note);
  }
  return { filled: true, notes, scheduled };
}

async function addMedia(context: FillContext): Promise<Note> {
  const { doc, pack, files, waits, press } = context;
  const names = pack.media.map((one) => one.filename).join(", ");
  const input = findIn(doc, selectors.media);
  if (input === null)
    return {
      ok: false,
      message: `LinkedIn's post box has no file input Slopify can use. Press Media and add ${names} yourself (Download them from Slopify's Prepare upload).`,
      copy: names,
    };
  setFiles(input as HTMLInputElement, files);
  const next = await until(waits, () => findIn(doc, selectors.mediaNext), 2000);
  if (next !== null) {
    press(next);
    await until(waits, () => findIn(doc, selectors.text));
  }
  return { ok: true, message: `Media added (${names}).` };
}

async function schedule(context: FillContext, iso: string): Promise<Note> {
  const { doc, waits, press } = context;
  try {
    const clock = findIn(doc, selectors.schedule);
    if (clock === null)
      return scheduleByHand("LinkedIn", iso, "Slopify didn't find LinkedIn's Schedule post clock.");
    press(clock);
    const date = (await until(waits, () =>
      findIn(doc, selectors.scheduleDate),
    )) as HTMLInputElement | null;
    const clockTime = findIn(doc, selectors.scheduleTime) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    const time = localTime(iso);
    if (date === null || clockTime === null)
      return scheduleByHand("LinkedIn", iso, "Slopify didn't find the schedule's date and time.");
    const twelve = `${String(time.hour12)}:${String(time.minute).padStart(2, "0")} ${time.meridiem}`;
    const timeSet =
      clockTime.tagName === "SELECT"
        ? setSelect(clockTime as HTMLSelectElement, twelve) ||
          setSelect(clockTime as HTMLSelectElement, time.time)
        : setTextValue(
            clockTime as HTMLInputElement,
            (clockTime as HTMLInputElement).type === "time" ? time.time : twelve,
          );
    if (!setTextValue(date, dateFor(date, time)) || !timeSet)
      return scheduleByHand(
        "LinkedIn",
        iso,
        "LinkedIn didn't take the date and time Slopify typed.",
      );
    const next = findIn(doc, selectors.scheduleNext);
    if (next === null)
      return scheduleByHand("LinkedIn", iso, "Slopify didn't find the schedule's Next.");
    press(next);
    return {
      ok: true,
      message: `Scheduled for ${time.said}. Check LinkedIn shows that time, then press Schedule.`,
    };
  } catch (error) {
    if (error instanceof RefusedClick)
      return scheduleByHand(
        "LinkedIn",
        iso,
        "LinkedIn's schedule asked for a button Slopify never presses.",
      );
    throw error;
  }
}

function published(doc: Document, location: URL): Published | null {
  const shown = findAllIn(doc, selectors.success).at(-1);
  if (shown === undefined) return null;
  const words = shown.textContent ?? "";
  if (/scheduled/i.test(words)) return { state: "scheduled" };
  const anchor = [...shown.querySelectorAll("a")].find((one) =>
    /view post/i.test(one.textContent ?? ""),
  );
  const href = anchor?.getAttribute("href");
  const url =
    href === null || href === undefined ? null : new URL(href, location.origin).toString();
  return { state: "posted", ...(url === null ? {} : { url }) };
}

function findLink(doc: Document, _location: URL, start: string): string | null {
  for (const update of findAllIn(doc, selectors.update)) {
    if (!startsLike(update.textContent ?? "", start)) continue;
    const urn = update.getAttribute("data-urn") ?? update.getAttribute("data-id");
    if (urn !== null) return `https://www.linkedin.com/feed/update/${urn}/`;
  }
  return null;
}

export const linkedin: Site = {
  platform: "linkedin",
  matches: siteMatches.linkedin,
  selectors,
  forbidden: {
    selectors: ["button.share-actions__primary-action", '[data-control-name="share.post"]'],
    labels: [],
  },
  isCompose: (location) =>
    location.pathname.startsWith("/feed") && location.searchParams.get("shareActive") === "true",
  fill,
  published,
  findLink,
};

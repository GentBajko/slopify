import { setFiles } from "../../fill.js";
import {
  findAllIn,
  findIn,
  isOn,
  labelOf,
  missingOf,
  type SiteSelectors,
  switchNear,
} from "../find.js";
import { RefusedClick } from "../guard.js";
import { typeRich } from "../rich-text.js";
import {
  absolute,
  aiLabelByHand,
  type FillContext,
  localTime,
  mediaFiles,
  type Note,
  type Published,
  pictureKinds,
  postText,
  type Site,
  type SiteReport,
  scheduleByHand,
  setTextValue,
  startsLike,
  switchOn,
  typedNote,
  until,
  videoKinds,
} from "../site.js";

// TikTok Studio's upload page (www.tiktok.com/tiktokstudio/upload; ?tab=photo for pictures). Seen
// on 2026-10-18 with a 3-second test video, never posted: the video input (accept video/*), and
// once the video is in, the Draft.js description (prefilled with the file name, 4,000
// characters), Show more → "AI-generated content", When to post (radios named postSchedule: Now
// | Schedule), and TikTok's "Turn on automatic content checks?" prompt, which is an account
// setting and is closed with Cancel (`modals.ts`). The date and time pickers that appear under
// Schedule were not opened. Post (which reads Schedule once a time is set) and Discard are
// never pressed.

const selectors = {
  video: {
    label: "the video input",
    selectors: ['input[type="file"][accept="video/*"]', 'input[type="file"][accept*="video"]'],
    checked: "2026-10-18",
  },
  photos: {
    label: "the photo input",
    selectors: ['input[type="file"][accept*="image"]'],
    checked: "2026-10-18",
  },
  description: {
    label: "the Description box",
    selectors: [
      '.public-DraftEditor-content[contenteditable="true"]',
      '[contenteditable="true"][role="combobox"]',
    ],
    checked: "2026-10-18",
  },
  showMore: {
    label: "Show more",
    selectors: ['[role="button"]', "button", "div", "span"],
    text: /^show more$/i,
    checked: "2026-10-18",
  },
  scheduleRadio: {
    label: 'When to post\'s "Schedule"',
    selectors: [
      'input[type="radio"][name="postSchedule"][value="schedule"]',
      'input[type="radio"][name="postSchedule"]',
    ],
    checked: "2026-10-18",
  },
  // The date and time boxes Schedule shows: not seen yet.
  scheduleInputs: {
    label: "the schedule's date and time",
    selectors: [".scheduled-picker input", '[class*="schedule" i] input:not([type="radio"])'],
    checked: null,
  },
  profileVideo: {
    label: "a video on the profile",
    selectors: ['[data-e2e="user-post-item"]', 'a[href*="/video/"]', 'a[href*="/photo/"]'],
    checked: null,
  },
} satisfies Record<string, SiteSelectors>;

const aiLabel = /^ai-generated content$/i;

// Pictures go on the Photos tab.
function pageFor(pack: FillContext["pack"], location: URL): string | null {
  const pictures =
    pack.media.length > 0 && pack.media.every((one) => pictureKinds.includes(one.kind));
  if (!pictures || location.searchParams.get("tab") === "photo") return null;
  const next = new URL(location.toString());
  next.searchParams.set("tab", "photo");
  return next.toString();
}

async function fill(context: FillContext): Promise<SiteReport> {
  const { doc, pack, files, waits } = context;
  const videos = mediaFiles(pack, files, videoKinds);
  const pictures = mediaFiles(pack, files, pictureKinds);
  const input = videos.length > 0 ? selectors.video : selectors.photos;
  const chosen = videos.length > 0 ? videos.slice(0, 1) : pictures;
  if (chosen.length === 0)
    return {
      filled: false,
      missing: [],
      notes: [
        {
          ok: false,
          message:
            "A TikTok post needs a video or pictures, and this one has none. Pick the short or pictures for TikTok in Slopify's Prepare upload, then press Fill in TikTok again.",
        },
      ],
    };
  await until(waits, () => findIn(doc, input));
  const missing = missingOf(doc, [input]);
  if (missing.length > 0) return { filled: false, missing, notes: [] };
  setFiles(
    findIn(doc, input) as HTMLInputElement,
    chosen.map((one) => one.file),
  );
  const notes: Note[] = [
    {
      ok: true,
      message:
        videos.length > 0
          ? `Added ${chosen[0]?.media.filename ?? "the video"}. TikTok uploads it as a draft; nothing is posted.`
          : `Added ${String(chosen.length)} pictures.`,
    },
  ];

  // The rest of the form appears once TikTok has taken the file.
  const box = await until(waits, () => findIn(doc, selectors.description), waits.uploadMs);
  if (box === null)
    return {
      filled: false,
      missing: [selectors.description.label],
      notes: [
        ...notes,
        {
          ok: false,
          message:
            "TikTok's Description box didn't appear after the upload, so nothing else was filled. Check the upload finished, then fill the rest by hand (Copy has the text).",
          copy: postText(pack),
        },
      ],
    };
  const needed: SiteSelectors[] = [];
  const native = pack.schedule.mode === "native" && pack.schedule.at !== null;
  if (native) needed.push(selectors.scheduleRadio);
  const absent = missingOf(doc, needed);

  const text = postText(pack);
  notes.push(
    typedNote(
      await typeRich(box as HTMLElement, text, {
        label: selectors.description.label,
        sleep: waits.sleep,
        copy: context.copy,
      }),
      text,
    ),
  );
  if (pack.aiLabel) notes.push(await aiSwitch(context));
  let scheduled = false;
  if (native && pack.schedule.at !== null) {
    const note =
      absent.length > 0
        ? scheduleByHand("TikTok", pack.schedule.at, `Slopify didn't find ${absent.join(", ")}.`)
        : await schedule(context, pack.schedule.at);
    scheduled = note.ok;
    notes.push(note);
  }
  return { filled: true, notes, scheduled };
}

async function aiSwitch(context: FillContext): Promise<Note> {
  const { doc, waits, press } = context;
  const where = "Show more → AI-generated content";
  try {
    let control = switchNear(doc, aiLabel);
    if (control === null) {
      const more = findIn(doc, selectors.showMore);
      if (more !== null) press(more);
      control = await until(waits, () => switchNear(doc, aiLabel));
    }
    if (control === null) return aiLabelByHand("TikTok", where);
    return (await switchOn(waits, press, control))
      ? { ok: true, message: "AI-generated content label switched on." }
      : aiLabelByHand("TikTok", where);
  } catch (error) {
    if (error instanceof RefusedClick) return aiLabelByHand("TikTok", where);
    throw error;
  }
}

async function schedule(context: FillContext, iso: string): Promise<Note> {
  const { doc, waits, press } = context;
  const radios = findAllIn(doc, selectors.scheduleRadio) as HTMLInputElement[];
  const radio =
    radios.find((one) => /schedule/i.test(one.value)) ??
    radios.find((one) => /schedule/i.test(labelOf(one.closest("label") ?? one))) ??
    radios[1];
  if (radio === undefined)
    return scheduleByHand("TikTok", iso, "Slopify didn't find When to post's Schedule.");
  if (!isOn(radio)) press(radio);
  const time = localTime(iso);
  const inputs = await until(waits, () => {
    const found = findAllIn(doc, selectors.scheduleInputs) as HTMLInputElement[];
    return found.length >= 2 ? found : null;
  });
  const date = inputs?.find((one) => /\d{4}-\d{2}-\d{2}/.test(one.value)) ?? inputs?.[1];
  const clock = inputs?.find((one) => /^\d{1,2}:\d{2}$/.test(one.value)) ?? inputs?.[0];
  if (date === undefined || clock === undefined || date === clock)
    return scheduleByHand("TikTok", iso, "Slopify couldn't find the schedule's date and time.");
  const set = setTextValue(date, time.date) && setTextValue(clock, time.time);
  if (!set)
    return scheduleByHand("TikTok", iso, "TikTok didn't take the date and time Slopify typed.");
  return {
    ok: true,
    message: `Scheduled for ${time.said} under When to post. Check TikTok shows that time, then press Schedule.`,
  };
}

function published(_doc: Document, location: URL): Published | null {
  return location.pathname.startsWith("/tiktokstudio/content") ? { state: "posted" } : null;
}

function findLink(doc: Document, location: URL, start: string): string | null {
  for (const item of findAllIn(doc, selectors.profileVideo)) {
    const words = [
      item.textContent ?? "",
      ...[...item.querySelectorAll("img[alt]")].map((img) => img.getAttribute("alt") ?? ""),
    ].join(" ");
    if (!startsLike(words, start)) continue;
    const anchor = item.matches("a")
      ? item
      : item.querySelector('a[href*="/video/"], a[href*="/photo/"]');
    const link = absolute(anchor, location);
    if (link !== null) return link.replace(/[?#].*$/, "");
  }
  return null;
}

export const tiktok: Site = {
  platform: "tiktok",
  matches: ["https://www.tiktok.com/*"],
  selectors,
  forbidden: {
    selectors: ['[data-e2e="post_video_button"]', '[data-e2e="discard_post_button"]'],
    labels: [],
  },
  isCompose: (location) => location.pathname.startsWith("/tiktokstudio/upload"),
  pageFor,
  fill,
  published,
  findLink,
};

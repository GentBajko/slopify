import { isOn, type SiteSelectors } from "./find.js";
import { type Forbidden, pressOn } from "./guard.js";
import type { PostMedia, PostPack, SocialPlatform } from "./types.js";

// What every site adapter (`sites/*.ts`) offers, and what a fill reports.

export interface Note {
  readonly ok: boolean;
  readonly message: string;
  // Text to paste by hand, for the toast's Copy button.
  readonly copy?: string | undefined;
}

export type SiteReport =
  // Nothing was written: a control the post needs isn't on the page (`missing` names them), or
  // the fill stopped before writing (`notes` say why).
  | {
      readonly filled: false;
      readonly missing: readonly string[];
      readonly notes: readonly Note[];
    }
  // The form is filled, each part with its note; `scheduled` when the site's own scheduler was
  // set to the release time (the person still presses its Schedule).
  | { readonly filled: true; readonly notes: readonly Note[]; readonly scheduled: boolean };

// The site's sign that the post went out (or was scheduled), with its link when the page shows
// one.
export interface Published {
  readonly state: "posted" | "scheduled";
  readonly url?: string | undefined;
}

export interface FillContext {
  readonly doc: Document;
  readonly location: URL;
  readonly pack: PostPack;
  // The post's media files, in `pack.media`'s order.
  readonly files: readonly File[];
  readonly waits: Waits;
  // Presses a control, refusing the site's forbidden ones (`guard.ts`).
  readonly press: (element: Element) => void;
  // Puts text on the clipboard (the sentence then says "copied"); a test passes a fake.
  readonly copy?: ((text: string) => Promise<boolean>) | undefined;
}

export interface Site {
  readonly platform: SocialPlatform;
  // The page addresses its content script runs on (`grant.ts`).
  readonly matches: readonly string[];
  readonly selectors: Readonly<Record<string, SiteSelectors>>;
  readonly forbidden: Forbidden;
  // Whether this page is the site's post form, where a waiting post is filled.
  isCompose(location: URL): boolean;
  // Another address of the post form this post needs (TikTok's Photos tab for pictures), or
  // null when this page is right.
  pageFor?(pack: PostPack, location: URL): string | null;
  fill(context: FillContext): Promise<SiteReport>;
  published(doc: Document, location: URL): Published | null;
  // The post's link on a profile page, found by the post's first characters.
  findLink(doc: Document, location: URL, start: string): string | null;
}

export interface Waits {
  readonly sleep: (ms: number) => Promise<void>;
  // How long to look for a control that appears after a click.
  readonly timeoutMs: number;
  // How long to wait for an uploaded video to be taken (TikTok's editor appears after it).
  readonly uploadMs: number;
}

export function waitsOf(options: Partial<Waits> = {}): Waits {
  return {
    sleep: options.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms))),
    timeoutMs: options.timeoutMs ?? 10_000,
    uploadMs: options.uploadMs ?? 5 * 60 * 1000,
  };
}

// Looks every 100 ms until `look` finds something, for up to `ms`.
export async function until<T>(
  waits: Waits,
  look: () => T | null | undefined,
  ms = waits.timeoutMs,
): Promise<T | null> {
  for (let waited = 0; ; waited += 100) {
    const found = look();
    if (found !== null && found !== undefined) return found;
    if (waited >= ms) return null;
    await waits.sleep(100);
  }
}

export function pressFor(site: Pick<Site, "platform" | "forbidden">): (element: Element) => void {
  return pressOn(site.platform, site.forbidden);
}

// A <select>'s value, through the prototype's setter so React sees it, then change.
export function setSelect(select: HTMLSelectElement, value: string): boolean {
  const view = select.ownerDocument.defaultView;
  const option = [...select.options].find(
    (one) => one.value === value || one.textContent?.trim() === value,
  );
  if (option === undefined) return false;
  const setter = Object.getOwnPropertyDescriptor(
    view?.HTMLSelectElement.prototype ?? HTMLSelectElement.prototype,
    "value",
  )?.set;
  if (setter === undefined) select.value = option.value;
  else setter.call(select, option.value);
  select.dispatchEvent(new (view?.Event ?? Event)("input", { bubbles: true }));
  select.dispatchEvent(new (view?.Event ?? Event)("change", { bubbles: true }));
  return select.value === option.value;
}

// The release time in the browser's own time zone, as the sites' pickers show it.
export interface LocalTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  // "2026-10-20", "20:00", "8", "PM", "October": the pieces the pickers take.
  readonly date: string;
  readonly time: string;
  readonly hour12: number;
  readonly meridiem: "AM" | "PM";
  readonly monthName: string;
  // How the toast says it: "20 Oct 2026, 20:00".
  readonly said: string;
}

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function localTime(iso: string): LocalTime {
  const at = new Date(iso);
  const two = (value: number) => String(value).padStart(2, "0");
  const year = at.getFullYear();
  const month = at.getMonth() + 1;
  const day = at.getDate();
  const hour = at.getHours();
  const minute = at.getMinutes();
  const monthName = months[month - 1] ?? "";
  return {
    year,
    month,
    day,
    hour,
    minute,
    date: `${String(year)}-${two(month)}-${two(day)}`,
    time: `${two(hour)}:${two(minute)}`,
    hour12: hour % 12 === 0 ? 12 : hour % 12,
    meridiem: hour < 12 ? "AM" : "PM",
    monthName,
    said: `${String(day)} ${monthName.slice(0, 3)} ${String(year)}, ${two(hour)}:${two(minute)}`,
  };
}

// The text a post's site gets: empty for a post without words.
export function postText(pack: PostPack): string {
  return pack.text.trim();
}

// The sentence for a scheduler that couldn't be set: the post is left to go out when the
// person presses Post, and says the time to set by hand.
export function scheduleByHand(site: string, iso: string, why: string): Note {
  const time = localTime(iso);
  return {
    ok: false,
    message: `${why} The post is left to go out when you press ${site}'s button: to schedule it instead, set ${time.said} in ${site}'s Schedule yourself.`,
  };
}

// The sentence for an AI label that couldn't be switched on.
export function aiLabelByHand(site: string, where: string): Note {
  return {
    ok: false,
    message: `Slopify couldn't find ${site}'s AI label (${where}), so it isn't switched on. Switch it on yourself before posting: the post's media was made with AI.`,
  };
}

// The absolute link an anchor points at.
export function absolute(anchor: Element | null, location: URL): string | null {
  const href = anchor?.getAttribute("href");
  if (href === null || href === undefined || href === "") return null;
  try {
    return new URL(href, location.origin).toString();
  } catch {
    return null;
  }
}

// A plain input's or textarea's value, through the prototype's setter so a framework watching
// the property sees the change, then the input and change events typing sends.
export function setTextValue(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  const view = field.ownerDocument.defaultView;
  const proto =
    field.tagName === "TEXTAREA"
      ? (view?.HTMLTextAreaElement.prototype ?? HTMLTextAreaElement.prototype)
      : (view?.HTMLInputElement.prototype ?? HTMLInputElement.prototype);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  field.focus();
  if (setter === undefined) field.value = value;
  else setter.call(field, value);
  field.dispatchEvent(
    new (view?.InputEvent ?? InputEvent)("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: value,
    }),
  );
  field.dispatchEvent(new (view?.Event ?? Event)("change", { bubbles: true }));
  return field.value === value;
}

// The note for the text typed (or not) into the post's box.
export function typedNote(
  result: { readonly ok: true } | { readonly ok: false; readonly sentence: string },
  text: string,
): Note {
  return result.ok
    ? { ok: true, message: "Text filled." }
    : { ok: false, message: result.sentence, copy: text };
}

// Switches an AI label on (pressing it only while it is off) and checks it took.
export async function switchOn(
  waits: Waits,
  press: (element: Element) => void,
  control: Element,
): Promise<boolean> {
  if (isOn(control)) return true;
  press(control);
  return (await until(waits, () => (isOn(control) ? true : null), 1000)) === true;
}

// The media of kinds a site takes, with their files.
export function mediaFiles(
  pack: PostPack,
  files: readonly File[],
  kinds: readonly PostMedia["kind"][],
): readonly { readonly media: PostMedia; readonly file: File }[] {
  return pack.media.flatMap((media, index) => {
    const file = files[index];
    return file !== undefined && kinds.includes(media.kind) ? [{ media, file }] : [];
  });
}

export const videoKinds: readonly PostMedia["kind"][] = ["video", "short"];
export const pictureKinds: readonly PostMedia["kind"][] = ["thumbnail", "picture", "design"];

// The post's first characters, as a profile page shows them, to match a post there.
export function startsLike(shown: string, start: string): boolean {
  const squeeze = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
  const wanted = squeeze(start);
  return wanted !== "" && squeeze(shown).includes(wanted);
}

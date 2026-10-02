import { click, press, pressToSave, setFiles, setInputValue } from "./fill.js";
import type { PackItem } from "./pack.js";

// What the extension does on Studio's pages besides filling the upload: the schedule in the
// upload dialog's Visibility step, the touches on a video's Details page after its upload (a
// short's related video, the long video's end screen and captions), and reading a video's
// Analytics. Each part was read on the live Studio page on 2026-10-02 (the Details editor's
// visibility popup, related-video picker, end screen editor and caption upload dialog; the
// Analytics Reach and Engagement tabs). Each says what it couldn't do, and never presses
// Schedule, Publish or Set test.

export interface Step {
  readonly ok: boolean;
  readonly message: string;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function until<T>(look: () => T | null | undefined, ms: number): Promise<T | null> {
  for (let waited = 0; ; waited += 200) {
    const found = look();
    if (found !== null && found !== undefined) return found;
    if (waited >= ms) return null;
    await sleep(200);
  }
}

const laidOut = (element: Element | null | undefined): element is Element =>
  element?.isConnected === true && element.getClientRects().length > 0;

const shownIn = (root: ParentNode, selector: string): Element | undefined =>
  [...root.querySelectorAll(selector)].find(laidOut);

const byText = (root: ParentNode, selector: string, text: RegExp): Element | undefined =>
  [...root.querySelectorAll(selector)].find(
    (one) => laidOut(one) && text.test((one.textContent ?? "").trim()),
  );

// ---- the schedule --------------------------------------------------------------------------

// Studio shows dates as "Oct 3, 2026" and times as "8:00 PM", in the browser's time zone.
export function studioDate(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(at);
}
export function studioTime(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}

// The Visibility step: opens Schedule and types the date and time. The person presses Schedule.
export async function fillSchedule(dialog: Element, at: Date): Promise<Step> {
  const when = `${studioDate(at)}, ${studioTime(at)}`;
  const byHand = (why: string): Step => ({
    ok: false,
    message: `${why} Set the schedule by hand: ${when}.`,
  });
  const select = shownIn(dialog, "ytcp-video-visibility-select");
  if (select === undefined) return byHand("Studio's Visibility choices weren't found.");
  let picker = shownIn(select, "ytcp-datetime-picker");
  if (picker === undefined) {
    const header =
      select.querySelector("#second-container-expand-button") ??
      byText(select, "#second-container *, div, span", /^Schedule$/i);
    if (header === undefined || header === null)
      return byHand("Studio's Schedule choice wasn't found.");
    press(header);
    picker = (await until(() => shownIn(select, "ytcp-datetime-picker"), 4000)) ?? undefined;
  }
  if (picker === undefined) return byHand("Studio's Schedule didn't open.");
  // The date: its dropdown holds a text field that takes a typed date.
  const trigger = picker.querySelector("#datepicker-trigger");
  if (trigger === null) return byHand("Studio's date field wasn't found.");
  press(trigger);
  const dateInput = await until(
    () => [...document.querySelectorAll<HTMLInputElement>("ytcp-date-picker input")].find(laidOut),
    3000,
  );
  if (dateInput === null) return byHand("Studio's date picker didn't open.");
  setInputValue(dateInput, studioDate(at));
  dateInput.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }),
  );
  await sleep(400);
  const time = picker.querySelector<HTMLInputElement>(
    "#time-of-day-container input, tp-yt-paper-input#textbox input",
  );
  if (time === null) return byHand("Studio's time field wasn't found.");
  setInputValue(time, studioTime(at));
  time.dispatchEvent(new Event("blur", { bubbles: true }));
  await sleep(400);
  const shownDate = (trigger.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!shownDate.includes(studioDate(at)) || time.value.trim() !== studioTime(at))
    return byHand("Studio didn't keep the date or time Slopify typed.");
  return {
    ok: true,
    message: `Schedule set to ${when} (your time). Check it, then press Schedule.`,
  };
}

// ---- the Details page, after the upload -------------------------------------------------

// Picks a video in Studio's "Choose specific video" dialog by its id (each card carries its
// thumbnail's address, which names the id), searching for it when it isn't in the first cards.
async function pickVideo(videoId: string): Promise<boolean> {
  const dialog = await until(
    () => shownIn(document, "ytcp-video-pick-dialog tp-yt-paper-dialog"),
    5000,
  );
  if (dialog === null) return false;
  const card = () =>
    [...dialog.querySelectorAll("ytcp-entity-card")].find((one) => one.outerHTML.includes(videoId));
  let found = await until(card, 3000);
  if (found === null) {
    const search = dialog.querySelector<HTMLInputElement>("input#search-yours");
    if (search !== null) {
      setInputValue(search, videoId);
      search.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }),
      );
      found = await until(card, 5000);
    }
  }
  if (found === null) return false;
  press(found);
  return (await until(() => (laidOut(dialog) ? null : true), 4000)) !== null;
}

async function relatedVideo(videoId: string): Promise<Step> {
  const trigger = document.querySelector("#linked-video-editor-link");
  if (!laidOut(trigger))
    return {
      ok: false,
      message: "The Related video field wasn't found; set it by hand to the long video.",
    };
  if ((trigger.innerHTML ?? "").includes(videoId))
    return { ok: true, message: "Related video already set." };
  click(trigger);
  return (await pickVideo(videoId))
    ? { ok: true, message: "Related video set to the long video." }
    : {
        ok: false,
        message:
          "The long video wasn't offered in Studio's video picker (it may not be public yet); set the Related video by hand.",
      };
}

async function endScreen(videoId: string): Promise<Step> {
  const byHand = (why: string): Step => ({
    ok: false,
    message: `${why} Add a Video element pointing to the previous episode (https://youtu.be/${videoId}) by hand.`,
  });
  const trigger = document.querySelector("#endscreen-editor-link");
  if (!laidOut(trigger)) return byHand("The End screen editor wasn't found.");
  click(trigger);
  const panel = await until(() => shownIn(document, "ytve-endscreen-editor-options-panel"), 15000);
  if (panel === null) return byHand("The End screen editor didn't open.");
  const add = panel.querySelector("#add-element-menu-button");
  if (add === null || add.hasAttribute("disabled"))
    return byHand("The end screen has no room for another element.");
  press(add);
  const video = await until(() => byText(document, "tp-yt-paper-item", /^Video$/), 3000);
  if (video === null) return byHand("The end screen's Video element wasn't offered.");
  press(video);
  const choose = await until(
    () => shownIn(document, "tp-yt-paper-radio-button#choose-video"),
    3000,
  );
  if (choose === null) return byHand("The Video element's Choose specific video wasn't found.");
  press(choose);
  if (!(await pickVideo(videoId)))
    return byHand("The previous episode wasn't offered in Studio's picker.");
  const save = shownIn(document, "ytve-modal-host ytcp-button#save-button");
  if (save === undefined) return byHand("The end screen editor's Save wasn't found.");
  pressToSave(save);
  const closed = await until(
    () => (shownIn(document, "ytve-endscreen-editor-options-panel") ? null : true),
    8000,
  );
  return closed === null
    ? byHand("The end screen editor didn't close after Save.")
    : { ok: true, message: "End screen points to the previous episode." };
}

async function captions(file: File): Promise<Step> {
  const byHand = (why: string): Step => ({
    ok: false,
    message: `${why} Upload the captions by hand: Subtitles → ⋮ → Upload file → With timing, and pick ${file.name} from the project folder.`,
  });
  const trigger = [
    ...document.querySelectorAll("ytcp-text-dropdown-trigger, ytcp-dropdown-trigger"),
  ].find((one) => laidOut(one) && /^\s*Subtitles\b/i.test(one.textContent ?? ""));
  if (trigger === undefined) return byHand("The Subtitles editor wasn't found.");
  click(trigger);
  const modal = await until(() => shownIn(document, "ytve-captions-editor-modal"), 15000);
  if (modal === null)
    return byHand("The Subtitles editor didn't open (it may ask for the video's language first).");
  const more = [...modal.querySelectorAll("ytcp-icon-button, button")].find(
    (one) => laidOut(one) && /more|option|action/i.test(one.getAttribute("aria-label") ?? ""),
  );
  if (more === undefined) return byHand("The Subtitles editor's ⋮ menu wasn't found.");
  press(more);
  const upload = await until(() => byText(document, "tp-yt-paper-item", /^Upload file$/i), 3000);
  if (upload === null) return byHand("Upload file wasn't offered in the Subtitles editor.");
  press(upload);
  const dialog = await until(
    () => shownIn(document, "ytve-captions-editor-upload-dialog tp-yt-paper-dialog"),
    4000,
  );
  if (dialog === null) return byHand("The caption upload dialog didn't open.");
  const timing = byText(dialog, "tp-yt-paper-radio-button", /^With timing$/i);
  if (timing !== undefined && timing.getAttribute("aria-checked") !== "true") press(timing);
  const input = document.querySelector<HTMLInputElement>(
    "ytve-captions-editor-upload-dialog input#captions-file-loader",
  );
  if (input === null) return byHand("The caption upload's file field wasn't found.");
  setFiles(input, [file]);
  await until(() => (laidOut(dialog) ? null : true), 10000);
  const done = shownIn(modal, "ytcp-button#publish-button");
  if (done === undefined) return byHand("The Subtitles editor's Done wasn't found.");
  pressToSave(done);
  const closed = await until(() => (laidOut(modal) ? null : true), 15000);
  return closed === null
    ? byHand("The Subtitles editor didn't close after Done.")
    : { ok: true, message: "Captions uploaded." };
}

// The touches after a confirmed upload, on its Details page: each one done or said why not,
// then the Details page's own Save when Studio enabled it.
export async function finishDetails(item: PackItem, captionsFile: File | undefined): Promise<Step> {
  await until(() => shownIn(document, "ytcp-video-metadata-editor"), 30000);
  await sleep(1500);
  const steps: Step[] = [];
  if (item.relatedVideoId !== undefined) steps.push(await relatedVideo(item.relatedVideoId));
  if (item.endScreenVideoId !== undefined) steps.push(await endScreen(item.endScreenVideoId));
  if (captionsFile !== undefined) steps.push(await captions(captionsFile));
  const save = document.querySelector("ytcp-button#save");
  if (
    save !== null &&
    !save.hasAttribute("disabled") &&
    save.getAttribute("aria-disabled") !== "true"
  ) {
    pressToSave(save);
    await until(() => (save.hasAttribute("disabled") ? true : null), 10000);
  }
  return {
    ok: steps.every((step) => step.ok),
    message: steps.map((step) => step.message).join(" "),
  };
}

// ---- Analytics ---------------------------------------------------------------------------

// A metric block's number as Studio writes it: "493", "2.2%", "1.2K", "32:19" (seconds), "—".
export function metricValue(text: string): number | undefined {
  const value = text.trim().replace(/,/g, "");
  if (value === "" || value === "—") return undefined;
  const clock = /^(?:(\d+):)?(\d+):(\d{2})$/.exec(value);
  if (clock !== null)
    return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const number = /^(\d+(?:\.\d+)?)\s*([KMB%])?$/i.exec(value);
  if (number === null) return undefined;
  const scale = { K: 1e3, M: 1e6, B: 1e9 }[(number[2] ?? "").toUpperCase() as "K" | "M" | "B"] ?? 1;
  return Number(number[1]) * scale;
}

// The key metrics shown on an Analytics tab, by Studio's own ids (VIDEO_THUMBNAIL_IMPRESSIONS,
// VIDEO_THUMBNAIL_IMPRESSIONS_VTR, EXTERNAL_VIEWS, EXTERNAL_WATCH_TIME, AVERAGE_WATCH_TIME).
export async function readMetrics(): Promise<Record<string, number>> {
  await until(() => document.querySelector("tp-yt-paper-item[id$='-tab'] #metric-total"), 20000);
  await sleep(1500);
  const out: Record<string, number> = {};
  for (const block of document.querySelectorAll("tp-yt-paper-item[id$='-tab']")) {
    const value = metricValue(block.querySelector("#metric-total")?.textContent ?? "");
    if (value !== undefined) out[block.id.replace(/-tab$/, "")] = value;
  }
  return out;
}

// ---- A/B results ---------------------------------------------------------------------------

export interface AbVariantRead {
  readonly title: string | null;
  readonly thumbnail: number | null;
  readonly share: number | null;
  readonly winner: boolean;
}

// A finished test's result, on the video's Details page: A/B Testing's button offers its results
// once Studio has them. Not read from a live finished test yet, so it reads cautiously: two or
// three rows each with a percentage, else nothing. It presses only the results button and closes
// what it opened with Escape.
export async function readAbResult(): Promise<readonly AbVariantRead[] | undefined> {
  await until(() => shownIn(document, "ytcp-video-metadata-editor"), 30000);
  await sleep(1500);
  const button = shownIn(document, "ytcp-button#ab-test-button");
  if (button === undefined || !/result|winner|complete/i.test(button.textContent ?? ""))
    return undefined;
  press(button);
  const dialog = await until(
    () =>
      [...document.querySelectorAll("tp-yt-paper-dialog")].find(
        (one) => laidOut(one) && /%/.test(one.textContent ?? ""),
      ),
    6000,
  );
  if (dialog === null) return undefined;
  const rows = [
    ...dialog.querySelectorAll(
      ".ytcpCreatorExperimentCreateDialogExperimentOption, [class*='ExperimentResult'], [class*='variant'], tr",
    ),
  ].filter((row) => /\d+(?:\.\d+)?\s*%/.test(row.textContent ?? ""));
  const variants = rows.slice(0, 3).map((row, index) => {
    const text = (row.textContent ?? "").replace(/\s+/g, " ").trim();
    const share = /(\d+(?:\.\d+)?)\s*%/.exec(text)?.[1];
    const title =
      row.querySelector("#textbox, [class*='title']")?.textContent?.replace(/\s+/g, " ").trim() ||
      null;
    return {
      title,
      thumbnail: row.querySelector("img") === null ? null : index + 1,
      share: share === undefined ? null : Number(share),
      winner: /winner|preferred|performed best/i.test(text),
    };
  });
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }),
  );
  return variants.length >= 2 ? variants : undefined;
}

import { browserApi } from "./browser.js";
import { type AbMode, type FieldResult, fillStudio, openAbTest, setFiles } from "./fill.js";
import { checkVideos, type RecordedVideo } from "./gone.js";
import { type ActivePack, type FillPayload, packText, type WorkerAnswer } from "./pack.js";
import { findField, title, uploadDialog, videoInput } from "./selectors.js";
import {
  adSuitabilityShown,
  fillSchedule,
  finishDetails,
  monetizationOn,
  monetizationUnset,
  rateAdSuitability,
  readAbResult,
  readMetrics,
} from "./studio-pages.js";
import type { VideoAnswer, VideoRequest } from "./video-frame.js";

// Runs on studio.youtube.com. When an upload dialog opens on its first step (Select files), it
// puts in the video file of the item waiting next in Slopify, as if the person had dropped it
// in: Studio uploads it as a private draft, and nothing is published. When an upload dialog
// shows its Details step (the person has
// dropped the video in), it asks the background worker for the next item waiting in Slopify,
// fills it once, tells Slopify it was filled (so the next upload dialog gets the next item),
// then offers "Fill again from Slopify". If Studio's dialog lacks a field the item needs, it
// fills nothing and puts the whole pack on the clipboard instead. Every message whose text has
// to be pasted by hand has a Copy button, since the page may refuse a clipboard write that no
// click asked for. It never presses Next, Save or Publish.

const api = browserApi();
const panelId = "slopify-studio-panel";
// The title box of the dialog being handled, and the item it was filled with.
let handled: Element | undefined;
let payload: FillPayload | undefined;
let againRow: HTMLElement | undefined;
// Whether Slopify was told this dialog's item is filled, so it leaves the queue once.
let reported = false;

function toastArea(): HTMLElement {
  let area = document.getElementById(panelId);
  if (area !== null) return area;
  area = document.createElement("div");
  area.id = panelId;
  area.setAttribute("role", "status");
  Object.assign(area.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxWidth: "380px",
    font: "13px/1.4 Roboto, Arial, sans-serif",
  });
  document.body.append(area);
  return area;
}

function toast(text: string, tone: "ok" | "error" | "info", copy?: string): void {
  const box = document.createElement("div");
  Object.assign(box.style, {
    background: tone === "error" ? "#5c1a1a" : tone === "ok" ? "#1d3b24" : "#282828",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: "8px",
    boxShadow: "0 4px 16px rgba(0,0,0,.4)",
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    alignItems: "flex-start",
  });
  const words = document.createElement("span");
  words.textContent = `Slopify: ${text}`;
  words.style.flex = "1";
  box.append(words);
  if (copy !== undefined) box.append(button("Copy", () => void copyFromClick(copy, box)));
  box.append(button("Close", () => box.remove()));
  toastArea().append(box);
}

// The Copy button: a click lets the page write the clipboard. Should even that be refused,
// the text is shown selected in the message, to copy with the keyboard.
async function copyFromClick(text: string, box: HTMLElement): Promise<void> {
  if (await copyText(text)) {
    toast("Copied.", "ok");
    return;
  }
  if (box.querySelector("textarea") !== null) return;
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.rows = 6;
  area.setAttribute("aria-label", "Text to copy");
  Object.assign(area.style, { width: "100%", font: "12px/1.4 monospace" });
  const hint = document.createElement("span");
  hint.textContent =
    "The browser refused the clipboard. The text is selected below: press Ctrl+C (⌘C on a Mac).";
  hint.style.width = "100%";
  box.append(hint, area);
  area.focus();
  area.select();
}

function button(label: string, run: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  Object.assign(element.style, {
    background: "transparent",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.5)",
    borderRadius: "4px",
    padding: "2px 8px",
    cursor: "pointer",
  });
  element.addEventListener("click", run);
  return element;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function file(entry: FillPayload["thumbnails"][number]): File {
  const binary = atob(entry.base64);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
  return new File([bytes], entry.filename, { type: entry.contentType });
}

// "the Title field", "the Title field and the Tags field", "a, b and c".
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

function itemName(item: FillPayload["item"]): string {
  return item.kind === "short" ? `short ${String(item.short)}` : "the video";
}

// Fills the dialog: a new dialog asks Slopify for the next waiting item; Fill again uses the
// same item as before.
async function fill(next: boolean): Promise<void> {
  if (next || payload === undefined) {
    const answer = (await api.runtime.sendMessage({
      type: "payload",
    })) as WorkerAnswer<FillPayload>;
    if (!answer.ok) {
      toast(answer.message, "error");
      return;
    }
    payload = answer.value;
  }
  const current = payload;
  const { item, thumbnails } = current;
  // The A/B test waits for the video to be public (scheduled videos can't be tested), so the
  // upload gets only the first thumbnail.
  const report = await fillStudio(document, item, thumbnails.map(file), { abTestLater: true });
  if (!report.filled) {
    const text = packText(item);
    const copied = await copyText(text);
    toast(
      `Nothing was filled: Studio's upload dialog has changed, and Slopify couldn't find ${listed(report.missing)}. ${copied ? "The whole upload pack is copied" : "Press Copy for the whole upload pack"}: paste each part by hand, or use the Copy buttons in Slopify → Prepare upload. Updating the extension (Slopify → Settings → YouTube Studio → Download) may fix it.`,
      "error",
      text,
    );
    return;
  }
  const results = report.results;
  // Only one text fits on the clipboard: the first field that needs pasting by hand gets it
  // now, the others through their Copy button.
  let copied = false;
  for (const result of results.filter((one) => !one.ok)) {
    const now: boolean = !copied && result.copy !== undefined && (await copyText(result.copy));
    copied ||= now;
    toast(now ? result.message : byHand(result), "error", result.copy);
  }
  const failed = results.filter((result) => !result.ok).length;
  // Thumbnails and the AI disclosure say what they did, so the person can check them.
  const notes = results.filter(
    (result) =>
      result.ok &&
      (result.field === "thumbnails" || result.field === "titles" || result.field === "altered"),
  );
  for (const note of notes) toast(note.message, "info");
  toast(
    failed === 0
      ? `Filled ${itemName(item)}'s details. Check them, then publish in Studio yourself.`
      : `Filled what it could; ${String(failed)} field${failed === 1 ? "" : "s"} need you. Nothing was published.`,
    failed === 0 ? "ok" : "info",
  );
  if (reported) return;
  reported = true;
  void recordVideo(current);
  // Filled: it leaves Slopify's queue, and the next upload dialog gets the next item.
  const left = (await api.runtime.sendMessage({
    type: "filled",
    projectId: current.projectId,
    short: item.kind === "short" ? (item.short ?? null) : null,
  })) as WorkerAnswer<number>;
  if (!left.ok) toast(left.message, "error");
  else if (left.value > 0)
    toast(
      `${String(left.value)} more upload${left.value === 1 ? "" : "s"} waiting from Slopify: start the next upload in Studio and it is filled the same way.`,
      "info",
    );
}

// Reads the new video's link from the upload dialog (Studio shows it once the upload starts)
// and tells Slopify, which keeps it; an upload with other titles or thumbnails gets its A/B test
// started once the video is public.
async function recordVideo(current: FillPayload): Promise<void> {
  const { item } = current;
  let videoId: string | undefined;
  for (let waited = 0; waited < 60_000 && videoId === undefined; waited += 1000) {
    const dialog = findField(document, uploadDialog);
    // A video's link is youtu.be/ID; a short's is youtube.com/shorts/ID.
    const link = dialog?.querySelector<HTMLAnchorElement>(
      'a#video-link, a[href*="youtu.be/"], a[href*="/shorts/"]',
    );
    videoId = /(?:youtu\.be\/|\/shorts\/|[?&]v=)([A-Za-z0-9_-]{11})/.exec(link?.href ?? "")?.[1];
    if (videoId === undefined) await new Promise((done) => setTimeout(done, 1000));
  }
  if (videoId === undefined) {
    toast(
      "Studio didn't show the new video's link, so Slopify can't start its A/B test by itself. Once it is up, paste its link in Slopify (project → YouTube → On YouTube).",
      "info",
    );
    return;
  }
  const upload = {
    projectId: current.projectId,
    short: item.kind === "short" ? (item.short ?? null) : null,
    videoId,
  };
  const answer = (await api.runtime.sendMessage({
    type: "video",
    ...upload,
  })) as WorkerAnswer<unknown>;
  if (!answer.ok) {
    toast(answer.message, "error");
    return;
  }
  // On YouTube only once Studio says so: a cancelled upload, or one closed as a draft, is not.
  if (!(await confirmed())) return;
  const done = (await api.runtime.sendMessage({
    type: "video-done",
    ...upload,
  })) as WorkerAnswer<unknown>;
  if (!done.ok) {
    toast(done.message, "error");
    return;
  }
  // Upload all Shorts: while more wait, the next upload dialog opens by itself.
  const stored = await api.storage.local.get(["uploadAllUntil"]);
  const until = typeof stored.uploadAllUntil === "number" ? stored.uploadAllUntil : 0;
  if (Date.now() > until) return;
  const next = (await api.runtime.sendMessage({ type: "pack" })) as WorkerAnswer<unknown>;
  if (!next.ok) {
    await api.storage.local.set({ uploadAllUntil: 0 });
    toast("All the shorts are uploaded.", "ok");
    return;
  }
  // One at a time: leaving this page while its file still uploads would stop the upload, so
  // the next one opens only once Studio says this one is up.
  if (!(await uploadFinished())) {
    toast(
      "This upload didn't finish within three hours, so the next short wasn't started. Click the extension's icon to upload it.",
      "error",
    );
    return;
  }
  toast("Uploaded. Opening the next short…", "info");
  setTimeout(() => location.assign("https://www.youtube.com/upload"), 2500);
}

// Whether Studio still uploads a file on this page: its progress panel and the confirmation
// window say "Uploading 45%", "… remaining" or "Keep this page open" until the file is up.
function stillUploading(): boolean {
  const places = [
    ...document.querySelectorAll(
      "ytcp-multi-progress-monitor, ytcp-video-share-dialog, ytcp-uploads-dialog, ytcp-video-upload-progress",
    ),
  ].filter(shown);
  const text = (places.length > 0 ? places : [document.body])
    .map((place) => (place as HTMLElement).innerText ?? place.textContent ?? "")
    .join(" ");
  return /\buploading\b|\d+\s*%\s*(uploaded|done)|remaining|keep this (page|window|tab) open|don't close/i.test(
    text,
  );
}

// Waits until the file is fully uploaded (two looks in a row with no upload going), up to
// three hours, saying how it goes; Studio's checks run on YouTube's side after that.
async function uploadFinished(): Promise<boolean> {
  let quiet = 0;
  let told = false;
  for (let waited = 0; waited < 3 * 60 * 60 * 1000; waited += 2000) {
    if (stillUploading()) {
      quiet = 0;
      if (!told) {
        toast("Waiting for this short to finish uploading before the next one starts…", "info");
        told = true;
      }
    } else if (++quiet >= 2) return true;
    await new Promise((done) => setTimeout(done, 2000));
  }
  return false;
}

// Waits for Studio's "Video scheduled" / "Video published" window after the person presses
// Schedule, Publish or Save; true when it shows, false when the upload dialog closes without
// it (cancelled, or left as a draft). Gives up after three hours.
async function confirmed(): Promise<boolean> {
  const said = /^\s*video (scheduled|published|saved)\b/i;
  for (let waited = 0; waited < 3 * 60 * 60 * 1000; waited += 1000) {
    const share = document.querySelector("ytcp-video-share-dialog");
    if (share !== null && shown(share)) return true;
    const headings = document.querySelectorAll(
      "tp-yt-paper-dialog h1, ytcp-dialog h1, tp-yt-paper-dialog #dialog-title, ytcp-dialog #dialog-title",
    );
    if ([...headings].some((one) => shown(one) && said.test(one.textContent ?? ""))) return true;
    const dialog = findField(document, uploadDialog);
    if (dialog === null || !shown(dialog)) {
      // Studio swaps the upload dialog for the confirmation; give it a moment.
      await new Promise((done) => setTimeout(done, 1500));
      const later = document.querySelector("ytcp-video-share-dialog");
      return later !== null && shown(later);
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  return false;
}

// A Studio page opened for one upload: the hash says what to do there and for which upload
// ("#slopify-ab=both&p=<project>&s=<short>", "#slopify-finish&…", "#slopify-stats=1&…").
// The task this page was opened for: kept by `early.ts` before Studio's router saw the "#…"
// (read once, so a later navigation in the same tab isn't taken for it), or still in the
// address on a page where the early script didn't run.
let task: string | undefined;
function hashParams(): URLSearchParams {
  if (task === undefined) {
    let kept: string | null = null;
    try {
      kept = sessionStorage.getItem("slopify.task");
      sessionStorage.removeItem("slopify.task");
    } catch {
      // No session storage: the address is all there is.
    }
    task = kept ?? location.hash.replace(/^#/, "");
  }
  return new URLSearchParams(task);
}

async function itemFor(projectId: string, short: number | null): Promise<FillPayload | undefined> {
  const answer = (await api.runtime.sendMessage({
    type: "item",
    projectId,
    short,
  })) as WorkerAnswer<FillPayload>;
  if (answer.ok) return answer.value;
  toast(answer.message, "error");
  return undefined;
}

async function editorReady(): Promise<void> {
  for (let waited = 0; waited < 30_000 && findField(document, title) === null; waited += 500)
    await new Promise((done) => setTimeout(done, 500));
}

// A/B test, from Slopify or the popup: A/B Testing set up, left open for the person.
async function runAb(mode: AbMode, projectId: string, short: number | null): Promise<void> {
  const payload = await itemFor(projectId, short);
  if (payload === undefined) return;
  await editorReady();
  const result = await openAbTest(document, payload.item, payload.thumbnails.map(file), mode, {
    timeoutMs: 8000,
  });
  toast(
    result.ok ? `${result.message} Then press Save on the video.` : result.message,
    result.ok ? "ok" : "error",
    result.copy,
  );
}

// The Details touches after a confirmed upload; reports, and the worker closes the tab.
async function runFinish(projectId: string, short: number | null): Promise<void> {
  const payload = await itemFor(projectId, short);
  const report = (ok: boolean, message: string) =>
    api.runtime.sendMessage({ type: "task-result", task: "finish", projectId, short, ok, message });
  if (payload === undefined) {
    await report(false, "Slopify didn't send the upload's details.");
    return;
  }
  const captions =
    payload.captions === undefined
      ? undefined
      : file({
          filename: payload.captions.filename,
          contentType: "application/x-subrip",
          base64: payload.captions.base64,
        });
  const result = await finishDetails(payload.item, short === null ? captions : undefined);
  await report(result.ok, result.message);
}

// Analytics: Reach, then Engagement (the page moves itself there), then report.
async function runStats(step: string, projectId: string, short: number | null): Promise<void> {
  const videoId = /\/video\/([A-Za-z0-9_-]{11})\//.exec(location.pathname)?.[1];
  if (videoId === undefined) return;
  const metrics = await readMetrics();
  const key = `slopify.stats.${videoId}`;
  if (step === "1") {
    sessionStorage.setItem(key, JSON.stringify(metrics));
    location.assign(
      `https://studio.youtube.com/video/${videoId}/analytics/tab-interest_viewers/period-default#slopify-stats=2&${hashParams()
        .toString()
        .replace(/^slopify-stats=1&?/, "")}`,
    );
    return;
  }
  let reach: Record<string, number> = {};
  try {
    reach = JSON.parse(sessionStorage.getItem(key) ?? "{}") as Record<string, number>;
  } catch {
    // Read again tomorrow.
  }
  const all = { ...reach, ...metrics };
  // A long video's A/B result is on its Details page: the page moves itself there once more.
  if (step === "2" && short === null) {
    sessionStorage.setItem(key, JSON.stringify(all));
    location.assign(
      `https://studio.youtube.com/video/${videoId}/edit#slopify-stats=3&${hashParams()
        .toString()
        .replace(/^slopify-stats=2&?/, "")}`,
    );
    return;
  }
  await api.runtime.sendMessage({
    type: "stats",
    projectId,
    short,
    videoId,
    metrics: all,
    last: true,
  });
}

// The last step for a long video: its A/B result, if Studio has one, with its numbers.
async function runAbRead(projectId: string): Promise<void> {
  const videoId = /\/video\/([A-Za-z0-9_-]{11})\//.exec(location.pathname)?.[1];
  if (videoId === undefined) return;
  let metrics: Record<string, number> = {};
  try {
    metrics = JSON.parse(sessionStorage.getItem(`slopify.stats.${videoId}`) ?? "{}") as Record<
      string,
      number
    >;
  } catch {
    // Read again tomorrow.
  }
  const abVariants = await readAbResult().catch(() => undefined);
  await api.runtime.sendMessage({
    type: "stats",
    projectId,
    short: null,
    videoId,
    metrics,
    ...(abVariants === undefined ? {} : { abVariants }),
    last: true,
  });
}

// A failure whose text isn't on the clipboard says to press its Copy instead.
function byHand(result: FieldResult): string {
  return result.message
    .replace("the text is copied", "press Copy on this message")
    .replace("It is copied", "Press Copy on this message")
    .replace("The text is copied", "Press Copy on this message")
    .replace("the name is copied", "press Copy for the name")
    .replace(/the playlist name "(.*)" is copied/, 'press Copy for the playlist name "$1"');
}

// Shown: attached, not inside a hidden element, and laid out.
function shown(element: Element): boolean {
  return (
    element.isConnected &&
    element.closest("[hidden]") === null &&
    element.getClientRects().length > 0
  );
}

// Watching all of Studio is costly, so mutations only schedule a look, at most every 250 ms,
// and the watching stops while a dialog is handled: a cheap check each second waits for that
// dialog to close, then the watching starts again for the next upload.
let scheduled: ReturnType<typeof setTimeout> | undefined;
const observer = new MutationObserver(schedule);

function schedule(): void {
  if (scheduled !== undefined) return;
  scheduled = setTimeout(() => {
    scheduled = undefined;
    look();
  }, 250);
}

function watch(): void {
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

// The file input of the dialog whose video was put in, so each dialog gets it once.
let picked: Element | undefined;
// The upload dialog a video was added to; none is added again while it stays open.
let addedTo: Element | null = null;
let lastAdded: { readonly key: string; readonly at: number } | undefined;

// Hands the waiting item's video to Studio's file input. The bytes come through a hidden frame
// of the extension's own (`video-frame.ts`), which passes the downloaded File back in one
// message, since the worker's JSON messages can't carry a video.
async function addVideo(input: HTMLInputElement): Promise<void> {
  const answer = (await api.runtime.sendMessage({ type: "pack" })) as WorkerAnswer<ActivePack>;
  // Nothing waits in Slopify (or it isn't running): the dialog is the person's own upload.
  if (!answer.ok) return;
  const { pack, item } = answer.value;
  if (item.video === null) return;
  // The same upload twice within a minute and a half is Studio rebuilding its dialog, not a
  // new upload: it is added once.
  const key = `${pack.projectId}:${String(item.short ?? 0)}`;
  if (lastAdded?.key === key && Date.now() - lastAdded.at < 90_000) return;
  lastAdded = { key, at: Date.now() };
  const video = item.video;
  const size =
    video.bytes >= 1024 ** 3
      ? `${(video.bytes / 1024 ** 3).toFixed(1)} GB`
      : `${String(Math.max(1, Math.round(video.bytes / 1024 ** 2)))} MB`;
  toast(`Adding ${itemName(item)} (${video.filename}, ${size}) from Slopify…`, "info");
  const frame = document.createElement("iframe");
  frame.src = api.runtime.getURL("video-frame.html");
  frame.hidden = true;
  const id = crypto.randomUUID();
  const file = await new Promise<File>((resolve, reject) => {
    const origin = new URL(frame.src).origin;
    const listen = (event: MessageEvent): void => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: unknown } | VideoAnswer;
      if (data.type === "slopify-video-ready") {
        frame.contentWindow?.postMessage(
          {
            type: "slopify-video",
            id,
            projectId: pack.projectId,
            asset: video.asset,
            filename: video.filename,
            contentType: video.contentType,
          } satisfies VideoRequest,
          origin,
        );
        return;
      }
      if (!("id" in data) || data.id !== id) return;
      window.removeEventListener("message", listen);
      if (data.type === "slopify-video-file") resolve(data.file);
      else reject(new Error(data.message));
    };
    window.addEventListener("message", listen);
    document.body.append(frame);
  }).finally(() => frame.remove());
  if (!input.isConnected) {
    toast(
      "The upload dialog closed before the video arrived, so nothing was added. Open Upload videos again.",
      "error",
    );
    return;
  }
  setFiles(input, [file]);
  toast(
    `Added ${video.filename}. Studio uploads it as a private draft; the details are filled next. Nothing is published.`,
    "ok",
  );
}

// Studio's Content list (Videos and Shorts tabs): each row's title, video id and Restrictions
// (the checks: "None" once copyright and ad suitability are clear) go to Slopify, which
// matches them to its projects by title, so uploads made by hand get their links too, and
// keeps each known video's checks. Sent when the rows change, not on every look. A list the
// worker opened only to read the checks ("#slopify-checks") is closed once it has sent them.
let sentRows = "";
function checksOf(row: Element): string | undefined {
  const cell = row.querySelector('.tablecell-restrictions, [class*="restrictions"]');
  const text = (cell?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text === "") return undefined;
  if (/^none$/i.test(text)) return "ok";
  return text.slice(0, 100);
}
function backfill(): void {
  const channel = /\/channel\/(UC[A-Za-z0-9_-]+)/.exec(location.pathname)?.[1];
  if (channel !== undefined) void api.storage.local.set({ studioChannel: channel });
  if (!/\/channel\/[^/]+\/videos/.test(location.pathname)) return;
  const rows = [...document.querySelectorAll("ytcp-video-row")].flatMap((row) => {
    const link = row.querySelector<HTMLAnchorElement>('a[href*="/video/"]');
    const videoId = /\/video\/([A-Za-z0-9_-]{11})/.exec(link?.getAttribute("href") ?? "")?.[1];
    const title = (row.querySelector("#video-title")?.textContent ?? "").trim();
    const checks = checksOf(row);
    return videoId === undefined || title === ""
      ? []
      : [{ title, videoId, ...(checks === undefined ? {} : { checks }) }];
  });
  const key = rows.map((row) => `${row.videoId}:${row.checks ?? ""}`).join(",");
  if (rows.length === 0 || key === sentRows) return;
  sentRows = key;
  void api.runtime.sendMessage({
    type: "backfill",
    videos: rows.slice(0, 200),
    close: hashParams().has("slopify-checks"),
  });
}

function look(): void {
  backfill();
  const dialog = findField(document, uploadDialog);
  // The first step: the dialog's file input, before a video is in.
  const picker = dialog === null ? null : findField(dialog, videoInput);
  // Only in an open dialog: Studio may keep the dialog in the page while it is closed.
  // One video per upload dialog: Studio rebuilds its file input while it starts the upload,
  // and each rebuilt input is not a new dialog. A new one may take a video only once the
  // dialog it was added to has closed.
  if (addedTo !== null && !(addedTo.isConnected && shown(addedTo))) addedTo = null;
  if (
    dialog !== null &&
    shown(dialog) &&
    addedTo === null &&
    picker instanceof HTMLInputElement &&
    picker !== picked &&
    findField(dialog ?? document, title) === null
  ) {
    picked = picker;
    addedTo = dialog;
    void addVideo(picker).catch((error: unknown) => {
      toast(
        `The video couldn't be added: ${error instanceof Error ? error.message : String(error)} Drop it in by hand: Open folder in Slopify's Prepare upload shows it.`,
        "error",
      );
    });
  }
  const titleBox = dialog === null ? null : findField(dialog, title);
  if (titleBox === null || titleBox === handled || !shown(titleBox)) return;
  handled = titleBox;
  observer.disconnect();
  // The Visibility step comes after the person presses Next: its schedule is typed in once.
  let scheduled = false;
  // A long video's Monetization step: turned on once. Ad suitability: answered once.
  let monetized = false;
  let rated = false;
  const closed = setInterval(() => {
    if (
      !monetized &&
      payload?.item.kind === "video" &&
      dialog !== null &&
      shown(dialog) &&
      monetizationUnset(dialog)
    ) {
      monetized = true;
      void monetizationOn(dialog).then((step) => toast(step.message, step.ok ? "ok" : "error"));
    }
    if (!rated && dialog !== null && shown(dialog) && adSuitabilityShown(dialog)) {
      rated = true;
      void rateAdSuitability(dialog).then((step) => toast(step.message, step.ok ? "ok" : "error"));
    }
    const at = payload?.item.scheduleAt;
    const visibility = dialog?.querySelector("ytcp-video-visibility-select");
    if (
      !scheduled &&
      at !== undefined &&
      dialog !== null &&
      visibility !== null &&
      visibility !== undefined &&
      shown(visibility)
    ) {
      scheduled = true;
      void fillSchedule(dialog, new Date(at)).then((step) =>
        toast(step.message, step.ok ? "ok" : "error"),
      );
    }
    // Open while the dialog shows, whichever step it is on.
    if (shown(titleBox) || (dialog !== null && shown(dialog))) return;
    clearInterval(closed);
    handled = undefined;
    againRow?.remove();
    watch();
    schedule();
  }, 1000);
  againRow?.remove();
  againRow = document.createElement("div");
  toastArea().append(againRow);
  againRow.append(button("Fill again from Slopify", () => void fill(false)));
  payload = undefined;
  reported = false;
  void fill(true);
}

// The extension opened Studio's Analytics view to export it ("#slopify-export&c=<channel>"):
// presses Export → Comma-separated values, takes the zip from Studio's answer (passed on by
// `export-hook.ts`), sends it to Slopify for that channel, and closes the tab.
async function runExport(channelId: string): Promise<void> {
  const report = (ok: boolean, message: string) =>
    api.runtime.sendMessage({ type: "export-done", channelId, ok, message });
  const caught = new Promise<string | null>((resolve) => {
    const listen = (event: MessageEvent): void => {
      const data = event.data as { source?: unknown; zippedData?: unknown } | null;
      if (event.source !== window || data?.source !== "slopify-export-hook") return;
      if (typeof data.zippedData !== "string") return;
      window.removeEventListener("message", listen);
      resolve(data.zippedData);
    };
    window.addEventListener("message", listen);
    setTimeout(() => {
      window.removeEventListener("message", listen);
      resolve(null);
    }, 90_000);
  });
  const button = await waitFor(
    () => document.querySelector("ytcp-icon-button#export-button"),
    45_000,
  );
  if (button === null) {
    await report(false, "Studio's Export button didn't show on the Analytics view.");
    return;
  }
  pressLike(button);
  const csv = await waitFor(
    () =>
      [...document.querySelectorAll('tp-yt-paper-item[test-id="CSV"]')].find(
        (one) => one.getClientRects().length > 0,
      ) ?? null,
    10_000,
  );
  if (csv === null) {
    await report(false, "Studio's Export menu didn't offer Comma-separated values.");
    return;
  }
  pressLike(csv);
  const zippedData = await caught;
  if (zippedData === null) {
    await report(false, "Studio didn't send the export within a minute and a half.");
    return;
  }
  const sent = (await api.runtime.sendMessage({
    type: "report",
    channelId,
    zippedData,
  })) as WorkerAnswer<{ rows: number }>;
  await report(sent.ok, sent.ok ? `Exported ${String(sent.value.rows)} videos.` : sent.message);
}

// The extension opened Studio to check the videos Slopify takes to be on YouTube
// ("#slopify-gone"): reads each one's edit page and reports the deleted ones (`gone.ts`).
async function runGone(): Promise<void> {
  const list = (await api.runtime.sendMessage({ type: "gone-list" })) as WorkerAnswer<
    readonly RecordedVideo[]
  >;
  const videos = list.ok ? list.value : [];
  const gone = await checkVideos(videos, async (videoId) => {
    const response = await fetch(`/video/${encodeURIComponent(videoId)}/edit`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error(`Studio answered ${String(response.status)}`);
    return await response.text();
  });
  await api.runtime.sendMessage({ type: "gone", videos: gone });
}

async function waitFor<T>(look: () => T | null, ms: number): Promise<T | null> {
  for (let waited = 0; waited < ms; waited += 300) {
    const found = look();
    if (found !== null) return found;
    await new Promise((done) => setTimeout(done, 300));
  }
  return null;
}

// Studio's menus open on a pointer press, not on a bare click() call.
function pressLike(element: Element): void {
  const box = element.getBoundingClientRect();
  const at = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    clientX: box.left + box.width / 2,
    clientY: box.top + box.height / 2,
  };
  const pointer = { ...at, pointerId: 1, pointerType: "mouse", isPrimary: true };
  element.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
  element.dispatchEvent(new MouseEvent("mousedown", { ...at, buttons: 1 }));
  element.dispatchEvent(new PointerEvent("pointerup", pointer));
  element.dispatchEvent(new MouseEvent("mouseup", at));
  element.dispatchEvent(new MouseEvent("click", at));
}

const params = hashParams();
const projectId = params.get("p");
const short = Number(params.get("s") ?? "0") || null;
const ab = params.get("slopify-ab");
const exportChannel = params.has("slopify-export") ? params.get("c") : null;
if (exportChannel !== null) void runExport(exportChannel);
else if (params.has("slopify-gone")) void runGone();
else if (projectId !== null && (ab === "titles" || ab === "thumbnails" || ab === "both"))
  void runAb(ab, projectId, short);
else if (projectId !== null && params.has("slopify-finish")) void runFinish(projectId, short);
else if (projectId !== null && params.get("slopify-stats") === "3") void runAbRead(projectId);
else if (projectId !== null && params.has("slopify-stats"))
  void runStats(params.get("slopify-stats") ?? "1", projectId, short);
else {
  watch();
  look();
}

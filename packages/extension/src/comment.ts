import { browserApi } from "./browser.js";
import type { FillPayload, WorkerAnswer } from "./pack.js";

// Runs on a YouTube watch page the worker opened for a pinned comment
// ("#slopify-comment&p=<project>&s=0"), once the video is public and only when Settings →
// YouTube Studio → "Post and pin the comment" is on: types the project's comment, posts it,
// then pins it from its own menu, and reports; the worker closes the tab. Nothing else on the
// page is touched.

const api = browserApi();
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function until<T>(look: () => T | null | undefined, ms: number): Promise<T | null> {
  for (let waited = 0; ; waited += 250) {
    const found = look();
    if (found !== null && found !== undefined) return found;
    if (waited >= ms) return null;
    await sleep(250);
  }
}

const shown = (element: Element | null | undefined): element is HTMLElement =>
  element instanceof HTMLElement && element.isConnected && element.getClientRects().length > 0;

async function post(text: string): Promise<string | undefined> {
  // The comments load once the page is scrolled to them.
  for (
    let tries = 0;
    tries < 10 && document.querySelector("#simplebox-placeholder") === null;
    tries++
  ) {
    window.scrollBy(0, 800);
    await sleep(800);
  }
  const placeholder = await until(
    () => document.querySelector<HTMLElement>("#simplebox-placeholder"),
    10000,
  );
  if (placeholder === null)
    return "The comment box wasn't found (comments may be off on this video).";
  // Posted already (a tab that never reported is opened again later): only pin that one.
  const earlier = threadWith(text);
  if (earlier !== undefined) return pin(earlier);
  placeholder.click();
  const box = await until(
    () => [...document.querySelectorAll<HTMLElement>("#contenteditable-root")].find(shown),
    5000,
  );
  if (box === null) return "The comment box didn't open.";
  box.focus();
  document.execCommand("insertText", false, text);
  await sleep(500);
  const submit = document.querySelector<HTMLElement>(
    "ytd-commentbox #submit-button button, ytd-commentbox #submit-button",
  );
  if (submit === null) return "The comment's Comment button wasn't found.";
  submit.click();
  const posted = await until(() => threadWith(text), 15000);
  if (posted === null) return "The comment didn't show after posting; check the video's comments.";
  return pin(posted);
}

const threadWith = (text: string): Element | undefined =>
  [...document.querySelectorAll("ytd-comment-thread-renderer")].find((thread) =>
    (thread.querySelector("#content-text")?.textContent ?? "").includes(text.slice(0, 40)),
  );

// The comment's own menu: Pin, then the confirmation's Pin.
async function pin(posted: Element): Promise<string | undefined> {
  if (shown(posted.querySelector("#pinned-comment-badge ytd-pinned-comment-badge-renderer")))
    return undefined;
  const menu = posted.querySelector<HTMLElement>("#action-menu button, ytd-menu-renderer button");
  if (menu === null)
    return "Posted, but the comment's menu wasn't found to pin it; pin it by hand.";
  menu.click();
  const pin = await until(
    () =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "ytd-menu-service-item-renderer, tp-yt-paper-item",
        ),
      ].find((item) => shown(item) && /^\s*Pin\s*$/i.test(item.textContent ?? "")),
    4000,
  );
  if (pin === null) return "Posted, but Pin wasn't offered in its menu; pin it by hand.";
  pin.click();
  const confirm = await until(
    () =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "yt-confirm-dialog-renderer #confirm-button button, yt-confirm-dialog-renderer #confirm-button",
        ),
      ].find(shown),
    4000,
  );
  if (confirm !== null) confirm.click();
  await sleep(1500);
  return undefined;
}

async function run(): Promise<void> {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const projectId = params.get("p");
  if (!params.has("slopify-comment") || projectId === null) return;
  const answer = (await api.runtime.sendMessage({
    type: "item",
    projectId,
    short: null,
  })) as WorkerAnswer<FillPayload>;
  const report = (ok: boolean, message: string) =>
    api.runtime.sendMessage({
      type: "task-result",
      task: "comment",
      projectId,
      short: null,
      ok,
      message,
    });
  const text = answer.ok ? answer.value.item.pinnedComment : undefined;
  if (text === undefined) {
    await report(false, "Slopify has no comment to pin for this video.");
    return;
  }
  const failed = await post(text);
  await report(failed === undefined, failed ?? "Comment posted and pinned.");
}

void run();

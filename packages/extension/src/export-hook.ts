// Runs in Studio's own page (`world: "MAIN"`, before Studio's scripts): Studio's Export
// asks its server (`/youtubei/v1/yta_web/csv_export`), whose JSON answer carries the zip it
// would download as `zippedData`. The answer is passed to the extension's content script in
// this tab, which sends it to Slopify only when the extension opened the page to export.
// Nothing else is read, and Studio's own handling of the answer is unchanged.

const exportPath = "/yta_web/csv_export";
const hand = (zippedData: unknown): void => {
  if (typeof zippedData !== "string" || zippedData === "") return;
  window.postMessage({ source: "slopify-export-hook", zippedData }, location.origin);
};

const fetched = window.fetch.bind(window);
window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
  const response = await fetched(...args);
  const url =
    typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
  if (url.includes(exportPath))
    void response
      .clone()
      .json()
      .then((body: { zippedData?: unknown }) => hand(body.zippedData))
      .catch(() => {});
  return response;
};

const xhrOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  ...rest: unknown[]
): void {
  if (String(url).includes(exportPath))
    this.addEventListener("load", () => {
      try {
        const body = (
          this.responseType === "json" ? this.response : JSON.parse(this.responseText)
        ) as { zippedData?: unknown };
        hand(body.zippedData);
      } catch {
        // Not the answer expected: Studio shows its own error.
      }
    });
  (xhrOpen as (...all: unknown[]) => void).call(this, method, url, ...rest);
};

// A tab the extension opened to export ("#slopify-export", kept by `early.ts`) keeps Studio's
// zip out of Downloads: Slopify has it already. The blob URLs Studio makes are noted, and a
// click on a link to one is dropped. Pages the person opens download as usual.
const exporting = (() => {
  try {
    return (
      location.hash.includes("slopify-export") ||
      (sessionStorage.getItem("slopify.task") ?? "").includes("slopify-export")
    );
  } catch {
    return location.hash.includes("slopify-export");
  }
})();
if (exporting) {
  const blobs = new Set<string>();
  const made = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object: Blob | MediaSource): string => {
    const url = made(object);
    blobs.add(url);
    return url;
  };
  const isSave = (target: unknown): boolean =>
    target instanceof HTMLAnchorElement &&
    (blobs.has(target.href) || (target.href.startsWith("blob:") && target.download !== ""));
  const clicked = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement): void {
    if (isSave(this)) return;
    clicked.call(this);
  };
  const dispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (this: EventTarget, event: Event): boolean {
    if (event.type === "click" && isSave(this)) return false;
    return dispatch.call(this, event);
  };
}

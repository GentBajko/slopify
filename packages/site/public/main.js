// The marketing page's live tally board (logic/16 step 7, uiux/screens/01). Plain ES
// module, no framework and no build step: the page is four static files.

// 07-operations: the collector URL is built into the release. A page served from a
// loopback origin talks to a local collector, which is what makes the counters
// exercisable without deploying anything.
export const collectorUrl = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(
  globalThis.location?.origin ?? "",
)
  ? "http://127.0.0.1:8787"
  : "https://collector.slopify.stream";

export const pollIntervalMs = 5_000;
// logic/16 §Q133: when the collector cannot be reached the page shows dashes, never a
// zero that reads as a real count and never an error.
export const dash = "—";

const grouped = new Intl.NumberFormat("en-GB");
const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const hours = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

const formats = {
  videos_made: (value) => grouped.format(Math.round(value)),
  audio_seconds: (value) => hours.format(value / 3600),
  images_made: (value) => grouped.format(Math.round(value)),
  tokens_used: (value) => compact.format(Math.round(value)),
  installs: (value) => grouped.format(Math.round(value)),
};

export function counterText(aggregates, key) {
  const format = formats[key];
  const value = aggregates?.[key];
  if (format === undefined || typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return dash;
  }
  return format(value);
}

// Answers the aggregates or null. Unreachable, slow, refusing and answering nonsense all
// mean the same thing to this page - dashes - so they are one return value rather than an
// error the visitor has to read.
export async function readAggregates(endpoint, fetcher) {
  try {
    const response = await fetcher(`${endpoint}/aggregates`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(pollIntervalMs),
    });
    if (!response.ok) {
      return null;
    }
    const body = await response.json();
    const aggregates = body?.aggregates;
    return typeof aggregates === "object" && aggregates !== null ? aggregates : null;
  } catch {
    return null;
  }
}

export function paint(root, aggregates) {
  for (const node of root.querySelectorAll("[data-counter]")) {
    const next = counterText(aggregates, node.dataset.counter);
    if (node.textContent === next) {
      continue;
    }
    node.textContent = next;
    fade(node);
  }
  const status = root.querySelector("[data-tally-status]");
  if (status !== null) {
    status.hidden = aggregates !== null;
  }
}

// uiux/screens/01: a changed digit fades over 150 ms, and nothing else on the page
// animates. Opacity only, and reduced motion swaps the digit instantly.
function fade(node) {
  if (typeof node.animate !== "function" || reducedMotion()) {
    return;
  }
  node.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
}

function reducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function poll(root, endpoint, fetcher) {
  const tick = async () => {
    paint(root, await readAggregates(endpoint, fetcher));
  };
  void tick();
  const timer = setInterval(() => void tick(), pollIntervalMs);
  return () => clearInterval(timer);
}

export function wireCopy(root, clipboard) {
  for (const button of root.querySelectorAll("[data-copy]")) {
    button.addEventListener("click", async () => {
      const status = root.querySelector("[data-copy-status]");
      try {
        await clipboard.writeText(button.dataset.copy);
      } catch {
        // A browser that refuses the clipboard leaves the command on screen to select by
        // hand; the button says so rather than pretending it worked.
        if (status !== null) {
          status.textContent = "Copying is blocked in this browser. Select the command instead.";
        }
        return;
      }
      button.textContent = "Copied";
      if (status !== null) {
        status.textContent = "Install command copied";
      }
      setTimeout(() => {
        button.textContent = "Copy";
      }, 2_000);
    });
  }
}

if (typeof document !== "undefined") {
  poll(document, collectorUrl, globalThis.fetch.bind(globalThis));
  wireCopy(
    document,
    globalThis.navigator?.clipboard ?? {
      writeText: () => Promise.reject(new Error("this browser has no clipboard")),
    },
  );
}

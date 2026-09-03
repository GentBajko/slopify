// Beside public/main.js rather than in it: everything inside public/ is uploaded to the
// static host verbatim, and a test file is not part of the page.
import { describe, expect, it } from "vitest";
import { counterText, dash, paint, readAggregates } from "./public/main.js";

const live = {
  installs: 876,
  projects_created: 4321,
  videos_made: 12345,
  images_made: 98765,
  thumbnails_made: 300,
  audio_seconds: 15_555_600,
  tokens_used: 1_200_000_000,
};

function answers(body, ok = true) {
  return async () => ({ ok, json: async () => body });
}

describe("counterText", () => {
  it("formats each counter the way the board reads it", () => {
    expect(counterText(live, "videos_made")).toBe("12,345");
    expect(counterText(live, "images_made")).toBe("98,765");
    expect(counterText(live, "installs")).toBe("876");
    expect(counterText(live, "tokens_used")).toBe("1.2B");
    expect(counterText(live, "audio_seconds")).toBe("4,321");
  });

  // logic/16 §Q133: dashes, never a zero that reads as a real count.
  it.each(["videos_made", "audio_seconds", "images_made", "tokens_used", "installs"])(
    "shows a dash for %s when there are no aggregates",
    (key) => {
      expect(counterText(null, key)).toBe(dash);
      expect(counterText(undefined, key)).toBe(dash);
    },
  );

  it("shows a real zero when the collector answers zero", () => {
    expect(counterText({ videos_made: 0 }, "videos_made")).toBe("0");
  });

  it("shows a dash for a counter the collector left out or garbled", () => {
    expect(counterText({}, "videos_made")).toBe(dash);
    expect(counterText({ videos_made: "many" }, "videos_made")).toBe(dash);
    expect(counterText({ videos_made: Number.NaN }, "videos_made")).toBe(dash);
    expect(counterText({ videos_made: -1 }, "videos_made")).toBe(dash);
  });

  it("shows a dash for a counter the board does not know", () => {
    expect(counterText(live, "mystery")).toBe(dash);
  });
});

describe("readAggregates", () => {
  it("asks the collector for its aggregates and returns them", async () => {
    const asked = [];
    const fetcher = async (url) => {
      asked.push(url);
      return { ok: true, json: async () => ({ aggregates: live }) };
    };

    expect(await readAggregates("http://127.0.0.1:8787", fetcher)).toEqual(live);
    expect(asked).toEqual(["http://127.0.0.1:8787/aggregates"]);
  });

  it.each([
    ["the collector is unreachable", () => Promise.reject(new Error("fetch failed"))],
    ["the collector errors", answers({}, false)],
    ["the answer is not JSON", () => ({ ok: true, json: () => Promise.reject(new Error("bad")) })],
    ["the answer has no aggregates", answers({ ok: true })],
    ["the aggregates are not an object", answers({ aggregates: "none" })],
    ["the aggregates are null", answers({ aggregates: null })],
  ])("answers null when %s", async (_label, fetcher) => {
    expect(await readAggregates("http://127.0.0.1:8787", fetcher)).toBeNull();
  });
});

// A stand-in for the two DOM calls paint makes. The page itself is checked in a browser;
// this pins the branch that decides between numbers and dashes.
function board(keys) {
  const counters = keys.map((key) => ({ dataset: { counter: key }, textContent: dash }));
  const status = { hidden: false };
  return {
    counters,
    status,
    querySelectorAll: () => counters,
    querySelector: () => status,
  };
}

describe("paint", () => {
  it("writes the numbers and hides the unavailable line", () => {
    const root = board(["videos_made", "installs"]);

    paint(root, live);

    expect(root.counters.map((node) => node.textContent)).toEqual(["12,345", "876"]);
    expect(root.status.hidden).toBe(true);
  });

  it("writes dashes and shows the unavailable line when there is nothing to show", () => {
    const root = board(["videos_made", "installs"]);
    paint(root, live);

    paint(root, null);

    expect(root.counters.map((node) => node.textContent)).toEqual([dash, dash]);
    expect(root.status.hidden).toBe(false);
  });
});

// Beside public/main.js rather than in it: everything inside public/ is uploaded to the
// static host verbatim, and a test file is not part of the page.
import { describe, expect, it } from "vitest";
import {
  counterText,
  dash,
  paint,
  readAggregates,
  tallyFoot,
  wireShowcase,
} from "./public/main.js";

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
    expect(counterText({ tokens_used: 1_200_000 }, "tokens_used")).toBe("1.2M");
    expect(counterText({ tokens_used: 4_300 }, "tokens_used")).toBe("4.3K");
    expect(counterText({ tokens_used: 2_500_000_000_000 }, "tokens_used")).toBe("2.5T");
    expect(counterText({ tokens_used: 999 }, "tokens_used")).toBe("999");
    expect(counterText({ tokens_used: 0 }, "tokens_used")).toBe("0");
    expect(counterText(live, "audio_seconds")).toBe("4,321");
  });

  // Dashes, never a zero that reads as a real count.
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

describe("tallyFoot", () => {
  it("names the collector live when there are aggregates", () => {
    expect(tallyFoot(live)).toEqual({ lamp: "run", word: "Live", note: "updates every 5 seconds" });
  });

  // The wording beside the dashes is fixed.
  it("names it off with the recorded wording when there are none", () => {
    expect(tallyFoot(null)).toEqual({ lamp: null, word: "Off", note: "live stats unavailable" });
  });
});

// A stand-in for the handful of DOM calls paint makes. The page itself is checked in a
// browser; this pins the branch that decides between numbers and dashes.
function board(keys) {
  const counters = keys.map((key) => ({ dataset: { counter: key }, textContent: dash }));
  const lamp = {
    attributes: { "data-loading": "" },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
  };
  const sheet = { ...lamp, attributes: { "data-loading": "" } };
  const word = { textContent: "Off" };
  const note = { textContent: "" };
  const nodes = {
    "[data-tally]": sheet,
    "[data-tally-lamp]": lamp,
    "[data-tally-word]": word,
    "[data-tally-status]": note,
  };
  return {
    counters,
    sheet,
    lamp,
    word,
    note,
    querySelectorAll: () => counters,
    querySelector: (selector) => nodes[selector] ?? null,
  };
}

describe("paint", () => {
  it("writes the numbers and lights the foot of the board", () => {
    const root = board(["videos_made", "installs"]);

    paint(root, live);

    expect(root.counters.map((node) => node.textContent)).toEqual(["12,345", "876"]);
    expect(root.lamp.attributes["data-lamp"]).toBe("run");
    expect(root.word.textContent).toBe("Live");
    expect(root.note.textContent).toBe("updates every 5 seconds");
  });

  it("writes dashes and says so when there is nothing to show", () => {
    const root = board(["videos_made", "installs"]);
    paint(root, live);

    paint(root, null);

    expect(root.counters.map((node) => node.textContent)).toEqual([dash, dash]);
    expect(root.lamp.attributes["data-lamp"]).toBeUndefined();
    expect(root.word.textContent).toBe("Off");
    expect(root.note.textContent).toBe("live stats unavailable");
  });

  // The skeleton ships in the markup so it is on screen before this module parses; the
  // first painted answer, numbers or dashes, takes it away for good.
  it.each([
    ["numbers", live],
    ["dashes", null],
  ])("clears the loading skeleton once it has painted %s", (_label, aggregates) => {
    const root = board(["videos_made"]);

    paint(root, aggregates);

    expect(root.sheet.attributes["data-loading"]).toBeUndefined();
  });

  it("leaves a board without a foot alone", () => {
    const counters = [{ dataset: { counter: "installs" }, textContent: dash }];
    const root = { querySelectorAll: () => counters, querySelector: () => null };

    expect(() => paint(root, live)).not.toThrow();
    expect(counters[0].textContent).toBe("876");
  });
});

// The video autoplays and loops, which is the only thing on this page that moves unasked.
// A stub stands in for the element because there is no DOM here: what matters is which
// properties get set, not how a browser renders them.
function videoStub() {
  let paused = false;
  return {
    autoplay: true,
    loop: true,
    controls: false,
    pause() {
      paused = true;
    },
    get paused() {
      return paused;
    },
  };
}

function rootWith(video, reduce) {
  globalThis.matchMedia = (query) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
  });
  return { querySelector: () => video };
}

describe("wireShowcase", () => {
  it("holds the frame and gives the controls back under reduced motion", () => {
    const video = videoStub();

    wireShowcase(rootWith(video, true));

    expect(video.autoplay).toBe(false);
    expect(video.loop).toBe(false);
    expect(video.controls).toBe(true);
    // autoplay may already have started it before this module ran.
    expect(video.paused).toBe(true);
  });

  it("leaves the video alone for everyone else", () => {
    const video = videoStub();

    wireShowcase(rootWith(video, false));

    expect(video.autoplay).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.controls).toBe(false);
    expect(video.paused).toBe(false);
  });

  // The recording is not in the repository yet, and the page has to survive that.
  it("does nothing when the page carries no video", () => {
    expect(() => wireShowcase(rootWith(null, true))).not.toThrow();
  });
});

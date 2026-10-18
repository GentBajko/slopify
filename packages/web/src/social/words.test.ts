import type { PostingExtension, PostSchedule, PostStatus } from "@app/slices/social/model.js";
import { describe, expect, it } from "vitest";
import { countLine, fillBlocked, releaseLine, stateLine, textSourceOptions } from "./words";

const at = "2026-10-20T18:00:00.000Z";
const when = (iso: string) => `T(${iso})`;

describe("Fill in <site> stays disabled with a reason", () => {
  const paired: PostingExtension = { paired: true, sites: ["x"], seenAt: "2026-10-18" };
  it("while no extension is paired", () => {
    expect(fillBlocked({ ...paired, paired: false }, "x")).toMatch(
      /Install and pair the Slopify Studio extension/,
    );
  });
  it("while the paired extension is from before posting", () => {
    expect(fillBlocked({ ...paired, sites: null }, "x")).toMatch(/Update the Slopify Studio/);
  });
  it("while the site isn't allowed in the extension's options", () => {
    expect(fillBlocked(paired, "bluesky")).toBe(
      "In the extension's options, press Allow posting on Bluesky, then reload this page",
    );
  });
  it("not once the site is allowed", () => {
    expect(fillBlocked(paired, "x")).toBeUndefined();
  });
});

describe("the release-time line", () => {
  const line = (schedule: PostSchedule, platform: "x" | "instagram") =>
    releaseLine(schedule, platform, when);
  it("names the site's own scheduler", () => {
    expect(line({ mode: "native", at }, "x")).toBe(
      `Scheduled in X's own scheduler for T(${at}). You press Schedule.`,
    );
  });
  it("says a site without one is filled at release time and the person presses Post", () => {
    expect(line({ mode: "at-release", at }, "instagram")).toBe(
      `Fills at release time (T(${at})) in a background tab; you press Post on Instagram.`,
    );
  });
  it("says a post without a time goes out when Post is pressed", () => {
    expect(line({ mode: "now", at: null }, "x")).toBe("Goes out when you press Post on X.");
  });
});

describe("where a post stands", () => {
  const status = (patch: Partial<PostStatus>): PostStatus => ({
    state: "none",
    url: null,
    message: null,
    at: null,
    by: null,
    ...patch,
  });
  it("is nothing before a fill", () => {
    expect(stateLine(status({}), "x", when)).toEqual({ tone: "off", text: "Not filled yet" });
  });
  it("names the failure the extension reported", () => {
    expect(
      stateLine(status({ state: "failed", message: "The text box wasn't found." }), "x", when),
    ).toEqual({ tone: "failed", text: "Fill stopped: The text box wasn't found." });
  });
  it("says a posted one is on the site", () => {
    expect(stateLine(status({ state: "posted", at }), "linkedin", when).text).toBe(
      `Posted on LinkedIn · T(${at})`,
    );
  });
});

describe("the counter", () => {
  it("says how the site counts", () => {
    expect(countLine({ used: 30, max: 280, unit: "weighted" })).toBe(
      "30 / 280 · links count as 23",
    );
    expect(countLine({ used: 301, max: 300, unit: "graphemes" })).toBe("301 / 300 · 1 over");
    expect(countLine({ used: 5, max: 2200, unit: "characters" })).toBe("5 / 2,200");
  });
});

describe("text sources", () => {
  it("offers the post prompt only where it may be picked", () => {
    expect(textSourceOptions(false).map((one) => one.value)).not.toContain("prompt");
    expect(textSourceOptions(true).map((one) => one.value)).toContain("prompt");
  });
});

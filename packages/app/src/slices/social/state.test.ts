import { describe, expect, it } from "vitest";
import { askFill, noProgress, type PostProgress, pasteLink, reportFill } from "./state.js";

const now = new Date("2026-10-18T10:00:00.000Z");
const waiting: PostProgress = { ...noProgress, state: "waiting", waitingAt: "w" };
const posted: PostProgress = {
  ...noProgress,
  state: "posted",
  postedAt: "p",
  url: "https://x.com/me/status/1",
  by: "person",
};
const xLink = "https://x.com/me/status/42";

describe("askFill", () => {
  it("puts a post waiting for the extension, forgetting an earlier failure", () => {
    const failed = { ...noProgress, state: "failed", message: "Stopped." } as const;
    expect(askFill(failed, "x", now)).toEqual({
      ok: true,
      progress: { ...noProgress, state: "waiting", waitingAt: now.toISOString() },
    });
  });

  it("refuses a post already on the site, naming how to post again", () => {
    const result = askFill(posted, "bluesky", now);
    expect(result).toMatchObject({ ok: false, reason: "posted" });
    expect(result.ok ? "" : result.sentence).toMatch(
      /already on Bluesky\. To post it again, remove its link/,
    );
  });
});

describe("reportFill", () => {
  it("refuses a report for a post nobody asked to fill", () => {
    const result = reportFill(noProgress, "linkedin", { state: "filled" }, now);
    expect(result).toMatchObject({ ok: false, reason: "not-asked" });
    expect(result.ok ? "" : result.sentence).toContain(
      "press Copy for YouTube Studio, then Fill in LinkedIn",
    );
  });

  it("marks the post filling, then filled by the extension", () => {
    const filling = reportFill(waiting, "x", { state: "filling" }, now);
    expect(filling).toMatchObject({ ok: true, progress: { state: "filling" } });
    const filled = reportFill(
      filling.ok ? filling.progress : waiting,
      "x",
      { state: "filled", message: "Press Post." },
      now,
    );
    expect(filled).toEqual({
      ok: true,
      progress: {
        ...waiting,
        state: "filled",
        filledAt: now.toISOString(),
        message: "Press Post.",
        by: "extension",
      },
    });
  });

  it("keeps when it was filled once the site schedules it", () => {
    const filled = { ...waiting, state: "filled", filledAt: "f" } as const;
    expect(reportFill(filled, "tiktok", { state: "scheduled" }, now)).toMatchObject({
      ok: true,
      progress: { state: "scheduled", filledAt: "f", scheduledAt: now.toISOString() },
    });
    expect(reportFill(waiting, "tiktok", { state: "scheduled" }, now)).toMatchObject({
      progress: { filledAt: now.toISOString() },
    });
  });

  it("records the link the site published", () => {
    expect(reportFill(waiting, "x", { state: "posted", url: xLink }, now)).toMatchObject({
      ok: true,
      progress: { state: "posted", url: xLink, postedAt: now.toISOString(), by: "extension" },
    });
  });

  it("refuses a link to another site", () => {
    const result = reportFill(waiting, "x", { state: "posted", url: "https://evil.test/x" }, now);
    expect(result).toMatchObject({ ok: false, reason: "bad-link" });
  });

  it("says why a fill stopped, with a sentence of its own when the extension gave none", () => {
    expect(
      reportFill(waiting, "reddit", { state: "failed", message: "No title field." }, now),
    ).toMatchObject({ progress: { state: "failed", message: "No title field." } });
    const silent = reportFill(waiting, "reddit", { state: "failed" }, now);
    expect(silent.ok ? silent.progress.message : "").toMatch(/Press Fill in Reddit again/);
  });

  it("keeps a posted post posted, filling in a link it lacked", () => {
    const bare = { ...posted, url: null };
    expect(reportFill(bare, "x", { state: "posted", url: xLink }, now)).toMatchObject({
      progress: { state: "posted", url: xLink },
    });
    expect(reportFill(posted, "x", { state: "posted", url: xLink }, now)).toMatchObject({
      progress: { url: posted.url },
    });
    expect(reportFill(posted, "x", { state: "failed" }, now)).toMatchObject({
      ok: false,
      reason: "posted",
    });
  });
});

describe("pasteLink", () => {
  it("marks the post posted by the person", () => {
    expect(pasteLink(noProgress, "x", ` ${xLink} `, now)).toEqual({
      ok: true,
      progress: {
        ...noProgress,
        state: "posted",
        postedAt: now.toISOString(),
        url: xLink,
        by: "person",
      },
    });
  });

  it("forgets the post's progress when the link is removed", () => {
    expect(pasteLink(posted, "x", null, now)).toEqual({ ok: true, progress: noProgress });
    expect(pasteLink(posted, "x", "  ", now)).toEqual({ ok: true, progress: noProgress });
  });

  it("refuses a link that isn't a post on that site, with an example", () => {
    const result = pasteLink(noProgress, "instagram", "https://x.com/me/status/1", now);
    expect(result.ok ? "" : result.sentence).toMatch(
      /isn't a link to a post on Instagram\. .*https:\/\/www\.instagram\.com\/p\//,
    );
  });
});

import type { StageKind, StageState } from "@app/kernel/pipeline.js";
import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Output, OutputRole } from "@app/slices/storage/model.js";
import { describe, expect, it } from "vitest";
import { duration, summaryOf } from "./summary.js";

const project = {
  id: "p1",
  title: "Rope Tricks",
  format: "16:9",
  status: "running",
  config: {},
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z",
} as unknown as ProjectSummary;

function stage(kind: StageKind, state: StageState, over: Partial<Stage> = {}): Stage {
  return {
    id: `s-${kind}`,
    projectId: "p1",
    kind,
    source: "generate",
    state,
    failureReason: null,
    attemptCount: 0,
    progressCurrent: null,
    progressTotal: null,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

function output(role: OutputRole, stageKind: StageKind, over: Partial<Output> = {}): Output {
  return {
    id: `o-${role}-${String(over.meta?.index ?? 0)}`,
    projectId: "p1",
    stageKind,
    role,
    path: role,
    originalFilename: null,
    bytes: 10,
    durationMs: null,
    meta: {},
    createdAt: "2026-09-03T00:00:00.000Z",
    ...over,
  };
}

describe("the summary in a rundown row", () => {
  it("says what a pending or skipped stage is doing about it", () => {
    expect(summaryOf(stage("audio", "pending"), [], project)).toBe("Waits for the stages above");
    expect(summaryOf(stage("research", "skipped"), [], project)).toBe("Not part of this run");
  });

  it("names the file behind a provided stage", () => {
    const outputs = [output("audio_body", "audio", { originalFilename: "body.mp3" })];
    expect(summaryOf(stage("audio", "provided"), outputs, project)).toBe("body.mp3");
  });

  it("falls back to the word when a provided stage kept no filename", () => {
    expect(summaryOf(stage("article", "provided"), [], project)).toBe("Provided");
  });

  it("counts the attempts a failed stage used, and leaves the error to its own line", () => {
    expect(summaryOf(stage("images", "failed", { attemptCount: 4 }), [], project)).toBe(
      "Stopped after 4 attempts",
    );
    expect(summaryOf(stage("images", "failed", { attemptCount: 1 }), [], project)).toBe(
      "Stopped after 1 attempt",
    );
  });

  it("says who canceled a canceled stage", () => {
    expect(summaryOf(stage("video", "canceled"), [], project)).toBe("Canceled by user");
  });

  it("counts a running stage in the unit that stage measures", () => {
    const meter = { progressCurrent: 3, progressTotal: 8 };
    expect(summaryOf(stage("research", "running", meter), [], project)).toBe("chapter 3 of 8");
    expect(summaryOf(stage("audio", "running", meter), [], project)).toBe("chunk 3 of 8");
    expect(summaryOf(stage("images", "running", meter), [], project)).toBe("image 3 of 8");
    expect(summaryOf(stage("thumbnail", "running", meter), [], project)).toBe("3 of 8");
    expect(summaryOf(stage("article", "running", meter), [], project)).toBe("3 of 8");
  });

  it("reads the video's meter as a render percentage", () => {
    const meter = { progressCurrent: 42, progressTotal: 100 };
    expect(summaryOf(stage("video", "running", meter), [], project)).toBe("42% rendered");
  });

  it("says only Running when the stage cannot report a count yet", () => {
    expect(summaryOf(stage("article", "running"), [], project)).toBe("Running");
    expect(
      summaryOf(stage("article", "running", { progressCurrent: 0, progressTotal: 0 }), [], project),
    ).toBe("Running");
  });

  it("lists the audio segments that exist and the longest one's length", () => {
    const outputs = [
      output("audio_intro", "audio", { durationMs: 7000 }),
      output("audio_body", "audio", { durationMs: 1_334_000 }),
      output("audio_outro", "audio", { durationMs: 5000 }),
    ];
    expect(summaryOf(stage("audio", "done"), outputs, project)).toBe(
      "Intro, body and outro · 22:14",
    );
  });

  it("names one audio segment without a list", () => {
    const outputs = [output("audio_body", "audio", { durationMs: 60_000 })];
    expect(summaryOf(stage("audio", "done"), outputs, project)).toBe("Body · 01:00");
  });

  it("counts the images the stage landed", () => {
    const outputs = [
      output("image", "images", { meta: { index: 1 } }),
      output("image", "images", { meta: { index: 2 } }),
    ];
    expect(summaryOf(stage("images", "done"), outputs, project)).toBe("2 images");
    expect(summaryOf(stage("images", "done"), outputs.slice(0, 1), project)).toBe("1 image");
    expect(summaryOf(stage("images", "done"), [], project)).toBe("0 images");
  });

  it("counts the article's end matter", () => {
    const outputs = [
      output("article_md", "article"),
      output("sources", "article"),
      output("glossary", "article"),
    ];
    expect(summaryOf(stage("article", "done"), outputs, project)).toBe(
      "Article and 2 end-matter files",
    );
    expect(summaryOf(stage("article", "done"), outputs.slice(0, 1), project)).toBe("Article ready");
  });

  it("says the research notes and the thumbnail are ready", () => {
    expect(summaryOf(stage("research", "done"), [], project)).toBe("Notes ready");
    expect(summaryOf(stage("thumbnail", "done"), [], project)).toBe("Thumbnail ready");
    expect(summaryOf(stage("thumbnail", "done"), [output("thumbnail", "thumbnail")], project)).toBe(
      "1 image",
    );
  });

  it("gives the finished video its length and the run's frame", () => {
    const outputs = [output("video", "video", { durationMs: 1_334_000 })];
    expect(summaryOf(stage("video", "done"), outputs, project)).toBe("22:14 · 16:9");
    expect(summaryOf(stage("video", "done"), [], project)).toBe("16:9");
  });
});

describe("a duration", () => {
  it("reads mm:ss below the hour and hh:mm:ss above it", () => {
    expect(duration(0)).toBeUndefined();
    expect(duration(7000)).toBe("00:07");
    expect(duration(3_661_000)).toBe("1:01:01");
  });

  it("is nothing at all when the output never recorded one", () => {
    expect(duration(undefined)).toBeUndefined();
    expect(duration(-1)).toBeUndefined();
    expect(duration(Number.NaN)).toBeUndefined();
  });
});

import type { ProjectSummary } from "@app/slices/admission/model.js";
import { describe, expect, it } from "vitest";
import { body, finished, output, stage } from "@/routes/project-fixtures";
import { type StatusInput, statusRows, timeLeft } from "./status-rows.js";

const project = finished.project as ProjectSummary;

const input = (over: Partial<StatusInput> = {}): StatusInput => ({
  stages: finished.stages,
  outputs: finished.outputs,
  project,
  resumable: false,
  holding: [],
  now: Date.parse("2026-09-03T00:10:00.000Z"),
  shorts: false,
  youtube: false,
  files: 9,
  ...over,
});

const line = (rows: ReturnType<typeof statusRows>) =>
  rows.map((row) =>
    [row.name, row.state, row.detail, row.more].filter((one) => one !== undefined).join(" | "),
  );

describe("the status list", () => {
  it("says Done with one detail for each finished output, then All files", () => {
    expect(line(statusRows(input()))).toEqual([
      "Article | Done | with sources and glossary",
      "Narration | Done | 01:00 · with intro and outro",
      "Images | Done | 2 images + 1 thumbnail",
      "Video | Done | 01:12 · 16:9",
      "All files | 9 files",
    ]);
    // All files is a place, not an output: no lamp and no state.
    expect(statusRows(input()).at(-1)?.tone).toBeUndefined();
  });

  it("says a supplied article was supplied, and a PDF its theme", () => {
    const rows = statusRows(
      input({
        stages: [stage("article", "provided"), stage("document", "done")],
        outputs: [output("article_txt", "article")],
      }),
    );
    expect(line(rows)).toEqual([
      "Article | Done | Supplied by you",
      "PDF | Done | DiceMaster theme",
      "All files | 9 files",
    ]);
  });

  it("leads with Progress while the run goes, and gives a row at work a second line", () => {
    const going = body({
      status: "running",
      stages: [
        stage("article", "done"),
        stage("audio", "running", { progressCurrent: 3, progressTotal: 8 }),
        stage("video", "pending"),
      ],
      outputs: [output("article_md", "article")],
    });
    const rows = statusRows(
      input({
        stages: going.stages,
        outputs: going.outputs,
        project: going.project as ProjectSummary,
      }),
    );
    expect(rows[0]).toMatchObject({
      id: "live",
      name: "Progress",
      state: "Running",
      // Counted as the title row counts: the step the run is at, not the steps done.
      detail: "Step 2 of 3",
    });
    expect(rows[2]).toMatchObject({
      name: "Narration",
      tone: "running",
      state: "Running",
      more: "chunk 3 of 8 · time left unknown",
    });
    // A step that has not started is one line: its state, nothing more.
    expect(rows[3]).toEqual({ id: "video", name: "Video", tone: "off", state: "Not started" });
  });

  // Nothing at work, a step waiting to run again by itself: Progress says it as the header does.
  it("says Waiting to try again on Progress while a step only waits to retry", () => {
    const rows = statusRows(
      input({
        stages: [
          stage("article", "done"),
          stage("images", "pending", { retryAt: "2026-09-27T14:05:00.000Z" }),
          stage("video", "pending"),
        ],
        outputs: [],
        project: { ...(input({}).project as ProjectSummary), status: "running" },
      }),
    );
    expect(rows[0]).toMatchObject({ id: "live", tone: "waiting", state: "Waiting to try again" });
  });

  it("speaks for a row of two stages with the one that needs the reader", () => {
    const rows = statusRows(
      input({
        stages: [
          stage("research", "failed", { attemptCount: 2 }),
          stage("article", "pending"),
          stage("images", "done"),
          stage("thumbnail", "running"),
        ],
        outputs: [],
      }),
    );
    expect(rows.find((row) => row.id === "article")).toMatchObject({
      tone: "failed",
      state: "Failed",
      more: "Stopped after 2 attempts",
    });
    expect(rows.find((row) => row.id === "images")).toMatchObject({ tone: "running" });
  });

  it("says how many outputs a section has outdated, in place of its detail", () => {
    const rows = statusRows(input({ outdated: (id) => (id === "images" ? 3 : 0) }));
    expect(rows.find((row) => row.id === "images")?.detail).toBe("3 outdated");
  });

  it("lists Shorts and YouTube as the video stands, then what they hold", () => {
    const shorts = [1, 2].map((short) =>
      output("short_video", "video", { id: `short-${String(short)}`, meta: { short } }),
    );
    const done = statusRows(
      input({
        shorts: true,
        youtube: true,
        outputs: [...finished.outputs, ...shorts, output("youtube_description", "video")],
      }),
    );
    expect(line(done).slice(4, 6)).toEqual([
      "Shorts | Done | 2 shorts",
      "YouTube | Done | description and tags",
    ]);
    const rendering = statusRows(
      input({
        shorts: true,
        youtube: true,
        stages: finished.stages.map((one) =>
          one.kind === "video" ? stage("video", "running") : one,
        ),
      }),
    );
    expect(line(rendering).filter((row) => /^(Shorts|YouTube)/.test(row))).toEqual([
      "Shorts | Running",
      "YouTube | Running",
    ]);
    // A finished video that made no shorts says so.
    expect(line(statusRows(input({ shorts: true }))).find((row) => row.startsWith("Shorts"))).toBe(
      "Shorts | Not made",
    );
  });

  // Renaming a project with a PDF sends its step back to waiting: the PDF is there, outdated,
  // not "Not started", and the shorts made with the video keep saying what they hold.
  it("says Outdated for a made step an edit sent back to waiting", () => {
    const shorts = [1, 2].map((short) =>
      output("short_video", "video", { id: `short-${String(short)}`, meta: { short } }),
    );
    const rows = statusRows(
      input({
        shorts: true,
        stages: [
          ...finished.stages.filter((one) => one.kind !== "document"),
          stage("document", "pending"),
        ],
        outputs: [...finished.outputs, ...shorts],
        outdated: (id) => (id === "document" ? 1 : 0),
      }),
    );
    expect(rows.find((row) => row.id === "document")).toEqual({
      id: "document",
      name: "PDF",
      tone: "info",
      state: "Outdated",
    });
    expect(line(rows).find((row) => row.startsWith("Shorts"))).toBe("Shorts | Done | 2 shorts");
    // A PDF never made stays Not started.
    expect(
      statusRows(
        input({
          stages: [
            ...finished.stages.filter((one) => one.kind !== "document"),
            stage("document", "pending"),
          ],
        }),
      ).find((row) => row.id === "document")?.state,
    ).toBe("Not started");
  });

  // Make the video again renders only the video: the shorts and the YouTube text it does not
  // touch keep their state, while a part the stage names as at work runs.
  it("keeps Shorts and YouTube done while the video alone is made again", () => {
    const made = [
      ...finished.outputs,
      output("short_video", "video", { id: "short-1", meta: { short: 1 } }),
      output("youtube_description", "video"),
    ];
    const rendering = (label?: string) =>
      line(
        statusRows(
          input({
            shorts: true,
            youtube: true,
            outputs: made,
            stages: finished.stages.map((one) =>
              one.kind === "video"
                ? stage("video", "running", label === undefined ? {} : { activity: { label } })
                : one,
            ),
          }),
        ),
      ).filter((row) => /^(Shorts|YouTube)/.test(row));
    expect(rendering("rendering the video")).toEqual([
      "Shorts | Done | 1 short",
      "YouTube | Done | description and tags",
    ]);
    expect(rendering("rendering the shorts")).toEqual([
      "Shorts | Running",
      "YouTube | Done | description and tags",
    ]);
    expect(rendering("writing the YouTube description")).toEqual([
      "Shorts | Done | 1 short",
      "YouTube | Running",
    ]);
    // Nothing named yet: either may be at work.
    expect(rendering()).toEqual(["Shorts | Running", "YouTube | Running"]);
  });

  it("keeps Images for an establishing image when the slideshow is off", () => {
    const rows = statusRows(
      input({
        project: {
          ...project,
          config: { ...project.config, reference: { source: "prompt", prompt: "Oil" } },
        },
        stages: [
          stage("article", "done"),
          stage("images", "skipped"),
          stage("thumbnail", "skipped"),
        ],
      }),
    );
    expect(rows.find((row) => row.id === "images")).toEqual({ id: "images", name: "Images" });
  });
});

describe("the time left", () => {
  it("adds the steps still to come when finished runs say how long each takes", () => {
    const now = Date.parse("2026-09-03T00:10:00.000Z");
    const running = stage("images", "running", {
      startedAt: "2026-09-03T00:09:00.000Z",
      progressCurrent: 1,
      progressTotal: 2,
    });
    expect(timeLeft([running, stage("video", "pending", { typicalSeconds: 240 })], now)).toBe(
      "about 5 min left",
    );
    expect(timeLeft([running, stage("video", "pending")], now)).toBe("this step: about 1 min left");
    expect(timeLeft([stage("video", "done")], now)).toBeUndefined();
  });

  it("says nothing when the running step has no estimate, rather than 'time left unknown'", () => {
    const now = Date.parse("2026-09-03T00:10:00.000Z");
    const rendering = stage("video", "running", {
      startedAt: "2026-09-03T00:09:00.000Z",
      progressCurrent: null,
      progressTotal: null,
    });
    expect(timeLeft([rendering, stage("document", "pending")], now)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import type { StageKind, StageState } from "../pipeline.js";
import { stageKinds } from "../pipeline.js";
import { dependenciesOf, deps, derive, progressOf, satisfied } from "./graph.js";

function stages(states: Partial<Record<StageKind, StageState>>): Array<{
  kind: StageKind;
  state: StageState;
}> {
  return stageKinds.map((kind) => ({ kind, state: states[kind] ?? "pending" }));
}

describe("deps", () => {
  it("starts images independently and waits for required article before video", () => {
    expect(deps).toEqual({
      research: [],
      article: ["research"],
      audio: ["article"],
      images: [],
      thumbnail: ["article"],
      video: ["article", "audio", "images", "thumbnail"],
    });
  });

  it("names a dependency for every stage kind and nothing else", () => {
    expect(Object.keys(deps).sort()).toEqual([...stageKinds].sort());
  });
});

describe("satisfied", () => {
  it("treats done, provided, and skipped alike", () => {
    // Dependencies satisfied by `provided` or `skipped` exactly as by `done`.
    expect(satisfied("done")).toBe(true);
    expect(satisfied("provided")).toBe(true);
    expect(satisfied("skipped")).toBe(true);
  });

  it("does not let a pending, running, failed, or canceled stage release a dependent", () => {
    expect(satisfied("pending")).toBe(false);
    expect(satisfied("running")).toBe(false);
    expect(satisfied("failed")).toBe(false);
    expect(satisfied("canceled")).toBe(false);
  });
});

describe("derive", () => {
  it("reads running while any stage runs, whatever else has happened", () => {
    expect(derive(stages({ research: "running" }))).toBe("running");
    expect(derive(stages({ research: "failed", article: "running" }))).toBe("running");
    expect(derive(stages({ research: "canceled", article: "running" }))).toBe("running");
    expect(derive(stages({ video: "done", audio: "running" }))).toBe("running");
  });

  it("reads canceled before failed once nothing runs", () => {
    expect(derive(stages({ research: "canceled", article: "failed" }))).toBe("canceled");
  });

  it("reads failed when a stage failed and none was canceled", () => {
    expect(derive(stages({ audio: "failed", video: "done" }))).toBe("failed");
  });

  it("reads done when every requested stage is satisfied", () => {
    expect(derive(stages({ ...allSatisfied(), video: "done" }))).toBe("done");
    expect(derive(stages({ ...allSatisfied(), video: "pending" }))).toBe("pending");
  });

  it("reads pending for a project whose stages have not started", () => {
    expect(derive(stages({}))).toBe("pending");
  });

  it("reads pending for a project with no stages at all", () => {
    expect(derive([])).toBe("pending");
  });

  it("leaves unfinished work pending when an independent stage finishes", () => {
    expect(derive(stages({ research: "done" }))).toBe("pending");
    expect(derive(stages({ images: "done" }))).toBe("pending");
  });

  it("finishes an article-only run and preserves an explicit pause while draining", () => {
    expect(
      derive(stages({ ...allSatisfied(), audio: "skipped", images: "skipped", video: "skipped" })),
    ).toBe("done");
    expect(derive(stages({ audio: "running" }), true)).toBe("paused");
  });

  // A stage the user supplied or switched off is not a stage the runner carried to the
  // end, so a project that has not started still reads `pending`.
  it("does not read canceled for a project whose only finished stages were provided", () => {
    expect(derive(stages({ ...allSatisfied(), video: "pending" }))).toBe("pending");
  });
});

function allSatisfied(): Partial<Record<StageKind, StageState>> {
  return {
    research: "skipped",
    article: "provided",
    audio: "provided",
    images: "provided",
    thumbnail: "skipped",
  };
}

// The thin meter under a running row on Projects, averaging stage progress.
describe("progressOf", () => {
  function measured(over: Partial<Record<StageKind, readonly [number | null, number | null]>>) {
    return stageKinds.map((kind) => {
      const pair = over[kind];
      return {
        kind,
        state: (pair === undefined ? "pending" : "running") as StageState,
        progressCurrent: pair?.[0] ?? null,
        progressTotal: pair?.[1] ?? null,
      };
    });
  }

  function settled(states: Partial<Record<StageKind, StageState>>) {
    return stages(states).map((stage) => ({
      ...stage,
      progressCurrent: null,
      progressTotal: null,
    }));
  }

  function every(state: StageState): Partial<Record<StageKind, StageState>> {
    const all: Partial<Record<StageKind, StageState>> = {};
    for (const kind of stageKinds) {
      all[kind] = state;
    }
    return all;
  }

  it("is nothing when every stage is still waiting", () => {
    expect(progressOf(settled({}))).toBe(0);
  });

  it("is everything when every stage has finished", () => {
    expect(progressOf(settled(every("done")))).toBe(1);
  });

  it("counts a finished stage as a whole and a waiting one as nothing", () => {
    expect(progressOf(settled({ research: "done", article: "done", audio: "done" }))).toBe(0.5);
  });

  it("leaves out the stages nothing was asked of, so a short run starts at zero", () => {
    // Research and thumbnail off, article, audio and images supplied: video is the run.
    expect(progressOf(settled(allSatisfied()))).toBe(0);
  });

  it("is everything when nothing at all was asked of the run", () => {
    expect(progressOf(settled(every("skipped")))).toBe(1);
  });

  it("counts a running stage by its own progress", () => {
    expect(progressOf(measured({ research: [1, 4] }))).toBeCloseTo(0.25 / 6, 10);
  });

  it("counts a running stage that has not said how much there is as nothing", () => {
    expect(progressOf(measured({ research: [0, 0] }))).toBe(0);
    expect(progressOf(measured({ research: [3, null] }))).toBe(0);
  });

  it("never runs past the end when a stage reports more than its total", () => {
    expect(progressOf(measured({ research: [9, 4] }))).toBeCloseTo(1 / 6, 10);
  });

  it("counts a failed or canceled stage as nothing, because its work is not done", () => {
    expect(progressOf(settled({ research: "failed", article: "canceled" }))).toBe(0);
  });

  it("has nothing outstanding for a project with no stage rows at all", () => {
    expect(progressOf([])).toBe(1);
  });
});

describe("source-aware dependencies", () => {
  const sources = {
    research: "generate",
    article: "generate",
    audio: "generate",
    images: "generate",
    thumbnail: "from_prompt",
    video: "generate",
  };
  it("starts a prewritten thumbnail independently, while an LLM-written one waits for article", () => {
    expect(dependenciesOf("thumbnail", sources)).toEqual([]);
    expect(dependenciesOf("thumbnail", { ...sources, thumbnail: "prompt_by_llm" })).toEqual([
      "article",
    ]);
  });
  it("exports WAV as soon as article and audio finish even if optional images fail", () => {
    expect(dependenciesOf("video", { ...sources, video: "off" })).toEqual(["article", "audio"]);
  });
});

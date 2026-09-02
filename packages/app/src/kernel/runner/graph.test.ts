import { describe, expect, it } from "vitest";
import type { StageKind, StageState } from "../pipeline.js";
import { stageKinds } from "../pipeline.js";
import { deps, derive, satisfied } from "./graph.js";

function stages(states: Partial<Record<StageKind, StageState>>): Array<{
  kind: StageKind;
  state: StageState;
}> {
  return stageKinds.map((kind) => ({ kind, state: states[kind] ?? "pending" }));
}

describe("deps", () => {
  it("wires research → article → {audio, images, thumbnail} → video", () => {
    expect(deps).toEqual({
      research: [],
      article: ["research"],
      audio: ["article"],
      images: ["article"],
      thumbnail: ["article"],
      video: ["audio", "images", "thumbnail"],
    });
  });

  it("names a dependency for every stage kind and nothing else", () => {
    expect(Object.keys(deps).sort()).toEqual([...stageKinds].sort());
  });
});

describe("satisfied", () => {
  it("treats done, provided, and skipped alike", () => {
    // logic/01 §Q2: "Dependencies satisfied by `provided` or `skipped` exactly as by `done`".
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

  it("reads done only when video is done", () => {
    expect(derive(stages({ ...allSatisfied(), video: "done" }))).toBe("done");
    expect(derive(stages({ ...allSatisfied(), video: "pending" }))).toBe("pending");
  });

  it("reads pending for a project whose stages have not started", () => {
    expect(derive(stages({}))).toBe("pending");
  });

  it("reads pending for a project with no stages at all", () => {
    expect(derive([])).toBe("pending");
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

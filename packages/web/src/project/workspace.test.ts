import { describe, expect, it } from "vitest";
import { stage } from "@/routes/project-fixtures";
import { overallProgress, suggestedStage } from "./workspace";

describe("overall project progress", () => {
  it("excludes skipped stages and includes measurable partial work", () => {
    expect(
      overallProgress([
        stage("research", "skipped"),
        stage("article", "provided"),
        stage("audio", "running", { progressCurrent: 2, progressTotal: 4 }),
        stage("video", "pending"),
      ]),
    ).toEqual({ completed: 1, total: 3, percent: 50 });
  });
  it("does not invent progress for a provider with no measurable total", () => {
    expect(
      overallProgress([stage("article", "running", { progressCurrent: null, progressTotal: null })])
        .percent,
    ).toBe(0);
  });
  it("does not report completion until every included stage has finished", () => {
    expect(
      overallProgress([stage("article", "running", { progressCurrent: 10, progressTotal: 10 })])
        .percent,
    ).toBe(99);
    expect(overallProgress([stage("article", "done")])).toEqual({
      completed: 1,
      total: 1,
      percent: 100,
    });
  });
  it("clamps provider counts and handles empty runs", () => {
    expect(overallProgress([])).toEqual({ completed: 0, total: 0, percent: 0 });
    expect(
      overallProgress([stage("audio", "running", { progressCurrent: -1, progressTotal: 2 })])
        .percent,
    ).toBe(0);
  });
});
describe("the initial project workspace", () => {
  it("opens a failure first, then current work, then the final completed output", () => {
    expect(
      suggestedStage([
        stage("article", "done"),
        stage("images", "failed"),
        stage("video", "pending"),
      ]),
    ).toBe("images");
    expect(suggestedStage([stage("article", "running"), stage("video", "pending")])).toBe(
      "article",
    );
    expect(suggestedStage([stage("article", "done"), stage("video", "done")])).toBe("video");
    expect(suggestedStage([stage("article", "provided"), stage("video", "skipped")])).toBe(
      "article",
    );
  });
});

import { describe, expect, it } from "vitest";
import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageSource } from "../admission/model.js";
import type { CascadeInput, RerunAction, StageStanding } from "./cascade.js";
import { redoPlan } from "./cascade.js";

// The cascade rule, decided with no database in reach.

function standing(overrides: Partial<Record<StageKind, StageState>> = {}): StageStanding[] {
  return stageKinds.map((kind) => ({ kind, state: overrides[kind] ?? "done" }));
}

function plan(
  action: RerunAction,
  overrides: Partial<Record<StageKind, StageState>> = {},
  thumbnailSource: StageSource = "from_prompt",
): string[] {
  const input: CascadeInput = { action, stages: standing(overrides), thumbnailSource };
  return redoPlan(input).map((redo) => `${redo.stage}:${redo.clears}`);
}

describe("a re-run of one stage", () => {
  // Every re-run marks its dependents `pending` and runs them automatically.
  it("carries the whole graph below research", () => {
    expect(plan({ kind: "rerun", stage: "research" })).toEqual([
      "research:all",
      "article:all",
      "audio:all",
      "images:all",
      "thumbnail:all",
      "video:nothing",
    ]);
  });

  it("takes only the video with the audio", () => {
    expect(plan({ kind: "rerun", stage: "audio" })).toEqual(["audio:all", "video:nothing"]);
  });

  // A re-render is the video stage alone.
  it("takes nothing with the video", () => {
    expect(plan({ kind: "rerun", stage: "video" })).toEqual(["video:nothing"]);
  });

  it("fans the article out over audio, images, the thumbnail and the video", () => {
    expect(plan({ kind: "rerun", stage: "article" })).toEqual([
      "article:all",
      "audio:all",
      "images:all",
      "thumbnail:all",
      "video:nothing",
    ]);
  });

  // `provided` → `running` and `skipped` → `running` are forbidden, so a
  // dependent the user supplied is stepped over rather than reset.
  it("steps over a provided dependent and still reaches the video", () => {
    expect(
      plan({ kind: "rerun", stage: "article" }, { audio: "provided", thumbnail: "skipped" }),
    ).toEqual(["article:all", "images:all", "video:nothing"]);
  });
});

describe("an article edit", () => {
  // Audio, LLM-mode intro/outro text, LLM-written thumbnail, and video re-run; prompt-based
  // images are untouched.
  it("redoes the audio and the video and leaves the prompt-based images alone", () => {
    expect(plan({ kind: "article-edit" })).toEqual(["audio:all", "video:nothing"]);
  });

  it("redoes an LLM-written thumbnail as well", () => {
    expect(plan({ kind: "article-edit" }, {}, "prompt_by_llm")).toEqual([
      "audio:all",
      "thumbnail:all",
      "video:nothing",
    ]);
  });

  it("leaves a prompt-based thumbnail alone", () => {
    expect(plan({ kind: "article-edit" }, {}, "from_prompt")).not.toContain("thumbnail:all");
  });

  it("still re-renders when the audio was provided", () => {
    expect(plan({ kind: "article-edit" }, { audio: "provided" })).toEqual(["video:nothing"]);
  });
});

describe("a change to one image", () => {
  // The set is smaller by one and the video is rebuilt from it.
  it("re-renders the video and nothing else when an image is deleted", () => {
    expect(plan({ kind: "image-deleted" })).toEqual(["video:nothing"]);
  });

  // One new call with that image's stored prompt text, replacing it in place at the same index
  // - which is the piece the first run planned, so it is kept.
  it("keeps what landed when one image is regenerated", () => {
    expect(plan({ kind: "image-regenerated" })).toEqual(["images:nothing", "video:nothing"]);
  });
});

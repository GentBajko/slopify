import { describe, expect, it } from "vitest";
import { etaLabel, modelKeyOf, stageEta } from "./model.js";

const start = "2026-09-27T10:00:00.000Z";
const at = (seconds: number) => Date.parse(start) + seconds * 1000;
const running = {
  state: "running" as const,
  startedAt: start,
  progressCurrent: null,
  progressTotal: null,
};

describe("stageEta", () => {
  it("goes by the rate so far once the step has counted something", () => {
    // 2 of 8 images in 4 minutes: 6 more at 2 minutes each.
    expect(
      stageEta({ ...running, progressCurrent: 2, progressTotal: 8, typicalSeconds: 60 }, at(240)),
    ).toEqual({ basis: "progress", seconds: 720 });
  });

  it("goes by how long such a step usually takes before anything is counted", () => {
    // A CLI image job drawing its first picture: nothing counted for minutes.
    expect(
      stageEta({ ...running, progressCurrent: 0, progressTotal: 1, typicalSeconds: 300 }, at(60)),
    ).toEqual({ basis: "history", seconds: 240 });
  });

  it("says so when the step has run past its usual time", () => {
    expect(stageEta({ ...running, typicalSeconds: 300 }, at(400))).toEqual({ basis: "overdue" });
  });

  it("says unknown with nothing to go by", () => {
    expect(stageEta(running, at(30))).toEqual({ basis: "unknown" });
  });

  it("has nothing to say about a step that isn't running", () => {
    expect(stageEta({ ...running, state: "done" }, at(30))).toBeUndefined();
    expect(stageEta({ ...running, state: "pending", startedAt: null }, at(30))).toBeUndefined();
  });

  it("finishes up once every piece is counted", () => {
    expect(stageEta({ ...running, progressCurrent: 4, progressTotal: 4 }, at(30))).toEqual({
      basis: "progress",
      seconds: 0,
    });
  });
});

describe("etaLabel", () => {
  it("rounds to what a person reads at a glance", () => {
    expect(etaLabel({ basis: "progress", seconds: 245 })).toBe("about 4 min left");
    expect(etaLabel({ basis: "history", seconds: 20 })).toBe("under a minute left");
    expect(etaLabel({ basis: "history", seconds: 4200 })).toBe("about 1 h 10 min left");
    expect(etaLabel({ basis: "history", seconds: 3600 })).toBe("about 1 h left");
    expect(etaLabel({ basis: "progress", seconds: 0 })).toBe("finishing up");
    expect(etaLabel({ basis: "overdue" })).toBe("taking longer than usual");
    expect(etaLabel({ basis: "unknown" })).toBe("time left unknown");
  });
});

describe("modelKeyOf", () => {
  const config = {
    llm: { provider: "claude-code", model: "sonnet" },
    audio: { provider: "openai-tts", model: "tts-1" },
    images: { provider: "codex", model: "gpt-image" },
  };
  it("names the provider and model each step runs on, and none for local steps", () => {
    expect(modelKeyOf("article", config)).toBe("claude-code/sonnet");
    expect(modelKeyOf("audio", config)).toBe("openai-tts/tts-1");
    expect(modelKeyOf("thumbnail", config)).toBe("codex/gpt-image");
    expect(modelKeyOf("video", config)).toBeUndefined();
    expect(modelKeyOf("images", {})).toBeUndefined();
  });
});

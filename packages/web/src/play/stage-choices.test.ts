import { describe, expect, it } from "vitest";
import { pauseLabel } from "./checkpoints";
import { sourceLabel, sourceOptions } from "./state";

const sources = (audio: string, images: string, video: string) => ({
  sources: { audio, images, video },
});

describe("each stage's choices in its own words", () => {
  it("says what each choice makes, and which one is paid", () => {
    expect(sourceOptions("audio").map((one) => one.label)).toEqual([
      "Off",
      "AI voice (paid per character)",
      "My own audio file",
    ]);
    expect(sourceOptions("images").map((one) => one.label)).toEqual([
      "None",
      "Made by AI (paid)",
      "My own images",
    ]);
    expect(sourceOptions("research").map((one) => one.label)).toEqual([
      "Off",
      "Let the AI research",
      "Paste my notes",
    ]);
    expect(sourceOptions("thumbnail").map((one) => one.label)).toEqual([
      "None",
      "From my thumbnail prompt",
      "Let the AI write the prompt",
      "Upload mine",
    ]);
    expect(sourceOptions("document").map((one) => one.label)).toEqual(["Off", "Make a PDF"]);
  });

  it("calls a video that is off a sound-only run only while there is narration", () => {
    expect(sourceLabel("video", "off")).toBe("Off (sound only)");
    expect(sourceLabel("video", "off", false)).toBe("Off");
    expect(sourceLabel("video", "generate")).toBe("Make the video");
  });
});

describe("a pause named for what there is to look at", () => {
  it("names the stage it stops after and the one that waits", () => {
    const all = sources("generate", "generate", "generate");
    expect(pauseLabel("audio", all)).toBe("Pause after the article (before the narration)");
    expect(pauseLabel("images", all)).toBe("Pause after the narration (before the images)");
    expect(pauseLabel("video", all)).toBe("Pause after the images (before the video)");
  });

  it("follows the stages this run makes", () => {
    expect(pauseLabel("images", sources("off", "generate", "generate"))).toBe(
      "Pause after the article (before the images)",
    );
    expect(pauseLabel("video", sources("generate", "off", "off"))).toBe(
      "Pause after the narration (before the sound file)",
    );
    expect(pauseLabel("video", sources("generate", "generate", "off"))).toBe(
      "Pause after the images (before the sound file)",
    );
  });
});

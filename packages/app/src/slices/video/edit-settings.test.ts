import { describe, expect, it } from "vitest";
import {
  animatedImageIndexes,
  defaultVideoEdit,
  editNeedsTiming,
  legacyVideoEdit,
  usesAnimation,
  usesNarrationCuts,
  type VideoEditSettings,
  videoEditProblems,
  videoEditRows,
} from "./edit-settings.js";

const sources = (audio: string, video = "generate") => ({ audio, video });

describe("edit settings", () => {
  it("reads a project without them as the slideshow it always rendered", () => {
    expect(usesNarrationCuts({ sources: sources("generate") })).toBe(false);
    expect(editNeedsTiming({ sources: sources("generate") })).toBe(false);
    expect(usesAnimation({ sources: sources("generate") })).toBe(false);
  });

  it("follows the narration for a new project, when there is narration and a video", () => {
    const edit = defaultVideoEdit;
    expect(usesNarrationCuts({ sources: sources("generate"), videoEdit: edit })).toBe(true);
    expect(usesNarrationCuts({ sources: sources("off"), videoEdit: edit })).toBe(false);
    expect(usesNarrationCuts({ sources: sources("generate", "off"), videoEdit: edit })).toBe(false);
  });

  it("cuts every N seconds in a language without word timing", () => {
    const edit = defaultVideoEdit;
    const narrated = { sources: sources("generate"), videoEdit: edit };
    expect(usesNarrationCuts({ ...narrated, language: "de" })).toBe(true);
    expect(usesNarrationCuts({ ...narrated, language: "ja" })).toBe(false);
  });

  it("needs the word timing for chapter openers but not for every Nth image", () => {
    const animated = (animate: VideoEditSettings["animate"]) => ({
      sources: sources("generate"),
      videoEdit: { ...legacyVideoEdit, animate, animateModel: "m" },
    });
    expect(editNeedsTiming(animated("chapters"))).toBe(true);
    expect(editNeedsTiming(animated("every"))).toBe(false);
    // Every Nth image needs no narration at all.
    expect(usesAnimation({ ...animated("every"), sources: sources("off") })).toBe(true);
  });

  it("says what is wrong in words, only while the video renders", () => {
    const wrong = {
      ...legacyVideoEdit,
      transition: "crossfade" as const,
      transitionSeconds: 3,
      chapterCards: true,
      animate: "every" as const,
      animateEvery: 1,
    };
    expect(
      videoEditProblems({ sources: sources("off"), videoEdit: wrong }).map((one) => one.field),
    ).toEqual(["transitionSeconds", "chapterCards", "animateEvery", "animateModel"]);
    expect(videoEditProblems({ sources: sources("off", "off"), videoEdit: wrong })).toEqual([]);
    // A hard cut's length is never looked at.
    expect(
      videoEditProblems({
        sources: sources("generate"),
        videoEdit: { ...legacyVideoEdit, transitionSeconds: Number.NaN },
      }),
    ).toEqual([]);
  });

  it("animates every Nth image from the first, or the chapter openers given", () => {
    const every = { ...legacyVideoEdit, animate: "every" as const, animateEvery: 3 };
    expect(animatedImageIndexes(every, 8)).toEqual([0, 3, 6]);
    const chapters = { ...legacyVideoEdit, animate: "chapters" as const };
    expect(animatedImageIndexes(chapters, 5, [4, 0, 4, 9])).toEqual([0, 4]);
    expect(animatedImageIndexes(legacyVideoEdit, 5)).toEqual([]);
  });

  it("puts every setting in words for the change list", () => {
    expect(
      videoEditRows({
        ...defaultVideoEdit,
        transition: "fadeblack",
        transitionSeconds: 0.8,
        grain: "subtle",
        animate: "every",
        animateEvery: 2,
        animateModel: "kling",
      }),
    ).toEqual([
      ["Cuts", "Follow the narration"],
      ["Transition", "Fade through black · 0.8 s"],
      ["Vignette", "Off"],
      ["Film grain", "Subtle"],
      ["Colour grade", "None"],
      ["Atmosphere", "None"],
      ["Chapter cards", "Off"],
      ["Animate images", "Every 2nd image · kling"],
    ]);
  });
});

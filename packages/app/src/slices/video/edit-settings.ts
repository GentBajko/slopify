// How the Video stage edits the slideshow beyond seconds per image, zoom and motion: where the
// cuts fall, how one shot hands over to the next, the Look (vignette, grain, colour, an
// atmosphere overlay and chapter cards), and which images come to life as short clips.
// Browser-safe: Play, Edit project, the review summary and the change list read these names,
// labels and limits too.
//
// A project saved before this existed has no settings at all, and absent reads as
// `legacyVideoEdit`: cuts every N seconds, hard cuts, no Look, nothing animated. That is what
// every video was, and the render recipe leaves every one of those values out of its
// fingerprint, so no finished video turns outdated. A new project starts from
// `defaultVideoEdit`, which follows the narration.

export const cutModes = ["interval", "narration"] as const;
export type CutMode = (typeof cutModes)[number];

export const transitionKinds = ["cut", "crossfade", "fadeblack", "slide", "wipe"] as const;
export type TransitionKind = (typeof transitionKinds)[number];

export const lookLevels = ["off", "subtle", "strong"] as const;
export type LookLevel = (typeof lookLevels)[number];

export const colorGrades = ["none", "warm", "cold", "desaturated", "sepia"] as const;
export type ColorGrade = (typeof colorGrades)[number];

// Drawn procedurally by ffmpeg's own filters (`look.ts`); no third-party footage.
export const atmospheres = ["none", "embers", "dust", "fog"] as const;
export type Atmosphere = (typeof atmospheres)[number];

export const animateModes = ["off", "chapters", "every"] as const;
export type AnimateMode = (typeof animateModes)[number];

export interface VideoEditSettings {
  readonly cuts: CutMode;
  readonly transition: TransitionKind;
  // How long a transition takes, centred on the cut. Ignored for a hard cut.
  readonly transitionSeconds: number;
  readonly vignette: LookLevel;
  readonly grain: LookLevel;
  readonly grade: ColorGrade;
  readonly atmosphere: Atmosphere;
  // A short title card at each chapter start.
  readonly chapterCards: boolean;
  readonly animate: AnimateMode;
  // For "every": every Nth image of the slideshow order.
  readonly animateEvery: number;
  // The image-to-video model, on the project's image provider. Blank while Animate is off.
  readonly animateModel: string;
}

export const legacyVideoEdit: VideoEditSettings = {
  cuts: "interval",
  transition: "cut",
  transitionSeconds: 0.6,
  vignette: "off",
  grain: "off",
  grade: "none",
  atmosphere: "none",
  chapterCards: false,
  animate: "off",
  animateEvery: 3,
  animateModel: "",
};

// What a new project starts with: the owner's pick is to follow the narration.
export const defaultVideoEdit: VideoEditSettings = { ...legacyVideoEdit, cuts: "narration" };

// ceiling: under 0.2 s a transition is a flash rather than a move; over 2 s it eats a short
// shot. The steps are the ones Play and Edit project offer.
export const transitionSecondsMin = 0.2;
export const transitionSecondsMax = 2;
export const transitionSecondsSteps = [0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.5, 2] as const;
export const animateEveryMin = 2;
export const animateEveryMax = 10;
// Image-to-video models make 5-second clips at their cheapest; a longer shot slows or loops
// the clip (`video/clip-timing.ts`).
export const animatedClipSeconds = 5;

// What an image is animated with: keep the picture, move a little. Image-to-video models
// invent the most when told the least.
export const animatePrompt =
  "Subtle cinematic motion: a slow, steady camera push-in with gentle ambient movement in the scene. Keep the composition, colours, lighting and style of the image exactly. No new objects, no text, no cuts.";

// A cut never lands closer than this share of Seconds per image to the one before, unless a
// chapter starts there.
export const cutFloorShare = 0.4;
// How long a chapter card stays on screen, fades included.
export const chapterCardSeconds = 2.5;
// How long the brand kit's end screen card stays on screen at the end of the video.
export const endScreenSeconds = 5;

export const cutModeLabels: Readonly<Record<CutMode, string>> = {
  interval: "Every N seconds",
  narration: "Follow the narration",
};
export const transitionLabels: Readonly<Record<TransitionKind, string>> = {
  cut: "Cut",
  crossfade: "Crossfade",
  fadeblack: "Fade through black",
  slide: "Slide",
  wipe: "Wipe",
};
export const lookLevelLabels: Readonly<Record<LookLevel, string>> = {
  off: "Off",
  subtle: "Subtle",
  strong: "Strong",
};
export const colorGradeLabels: Readonly<Record<ColorGrade, string>> = {
  none: "None",
  warm: "Warm fantasy",
  cold: "Cold",
  desaturated: "Desaturated",
  sepia: "Sepia",
};
export const atmosphereLabels: Readonly<Record<Atmosphere, string>> = {
  none: "None",
  embers: "Embers",
  dust: "Dust",
  fog: "Fog",
};
export const animateModeLabels: Readonly<Record<AnimateMode, string>> = {
  off: "Off",
  chapters: "Chapter openers",
  every: "Every Nth image",
};

// The settings a project renders with: its own, or today's behaviour when it has none.
export function videoEditOf(config: {
  readonly videoEdit?: VideoEditSettings | undefined;
}): VideoEditSettings {
  return config.videoEdit ?? legacyVideoEdit;
}

interface EditSources {
  readonly sources: { readonly audio: string; readonly video: string };
  readonly videoEdit?: VideoEditSettings | undefined;
}

// Following the narration needs narration to follow and a video to cut; otherwise the video
// falls back to Every N seconds, which is also what its fingerprint says.
export function usesNarrationCuts(config: EditSources): boolean {
  return (
    videoEditOf(config).cuts === "narration" &&
    config.sources.audio !== "off" &&
    config.sources.video === "generate"
  );
}

// Chapter cards are placed from the narration's word timing, so they need narration too.
export function usesChapterCards(config: EditSources): boolean {
  return (
    videoEditOf(config).chapterCards &&
    config.sources.audio !== "off" &&
    config.sources.video === "generate"
  );
}

// "Chapter openers" needs chapters, which come from the narration's word timing.
export function usesAnimation(config: EditSources): boolean {
  const edit = videoEditOf(config);
  return (
    edit.animate !== "off" &&
    config.sources.video === "generate" &&
    (edit.animate === "every" || config.sources.audio !== "off")
  );
}

// Whether the render needs the word timing: to cut on sentences, to place chapter cards, or to
// know which images open a chapter.
export function editNeedsTiming(config: EditSources): boolean {
  return (
    usesNarrationCuts(config) ||
    usesChapterCards(config) ||
    (usesAnimation(config) && videoEditOf(config).animate === "chapters")
  );
}

export type EditField =
  | "transition"
  | "transitionSeconds"
  | "animate"
  | "animateEvery"
  | "animateModel"
  | "chapterCards";

// The words a problem with one of the settings is said in; shared by admission, Play's draft
// conversion and Edit project.
export function videoEditProblems(
  config: EditSources,
): readonly { readonly field: EditField; readonly message: string }[] {
  const edit = config.videoEdit;
  if (edit === undefined || config.sources.video !== "generate") return [];
  const problems: { field: EditField; message: string }[] = [];
  if (
    edit.transition !== "cut" &&
    !(
      Number.isFinite(edit.transitionSeconds) &&
      edit.transitionSeconds >= transitionSecondsMin &&
      edit.transitionSeconds <= transitionSecondsMax
    )
  )
    problems.push({
      field: "transitionSeconds",
      message: `Choose a transition length between ${String(transitionSecondsMin)} and ${String(transitionSecondsMax)} seconds.`,
    });
  if (edit.chapterCards && config.sources.audio === "off")
    problems.push({
      field: "chapterCards",
      message:
        "Chapter cards are placed from the narration. Turn narration on, or turn chapter cards off.",
    });
  if (edit.animate === "chapters" && config.sources.audio === "off")
    problems.push({
      field: "animate",
      message:
        "Chapter openers are found from the narration. Turn narration on, or choose Every Nth image.",
    });
  if (
    edit.animate === "every" &&
    !(
      Number.isInteger(edit.animateEvery) &&
      edit.animateEvery >= animateEveryMin &&
      edit.animateEvery <= animateEveryMax
    )
  )
    problems.push({
      field: "animateEvery",
      message: `Choose every 2nd to every ${String(animateEveryMax)}th image.`,
    });
  if (edit.animate !== "off" && edit.animateModel.trim() === "")
    problems.push({
      field: "animateModel",
      message: "Choose an image-to-video model to animate images with, or turn Animate images off.",
    });
  return problems;
}

// The settings in words, one row each, as the change list and the review summary show them.
export function videoEditRows(
  edit: VideoEditSettings,
): readonly (readonly [label: string, value: string])[] {
  const nth = (n: number): string => (n === 2 ? "2nd" : n === 3 ? "3rd" : `${String(n)}th`);
  return [
    ["Cuts", cutModeLabels[edit.cuts]],
    [
      "Transition",
      edit.transition === "cut"
        ? transitionLabels.cut
        : `${transitionLabels[edit.transition]} · ${String(edit.transitionSeconds)} s`,
    ],
    ["Vignette", lookLevelLabels[edit.vignette]],
    ["Film grain", lookLevelLabels[edit.grain]],
    ["Colour grade", colorGradeLabels[edit.grade]],
    ["Atmosphere", atmosphereLabels[edit.atmosphere]],
    ["Chapter cards", edit.chapterCards ? "On" : "Off"],
    [
      "Animate images",
      edit.animate === "off"
        ? animateModeLabels.off
        : `${edit.animate === "every" ? `Every ${nth(edit.animateEvery)} image` : animateModeLabels.chapters}${edit.animateModel.trim() === "" ? "" : ` · ${edit.animateModel}`}`,
    ],
  ];
}

// Which images of the slideshow order (0-based) are animated: every Nth from the first, or
// the ones that open a chapter. `chapterImages` is the image index each chapter opens on.
export function animatedImageIndexes(
  edit: Pick<VideoEditSettings, "animate" | "animateEvery">,
  imageCount: number,
  chapterImages: readonly number[] = [],
): readonly number[] {
  if (edit.animate === "off" || imageCount <= 0) return [];
  if (edit.animate === "every") {
    const every = Math.max(1, Math.round(edit.animateEvery));
    return Array.from({ length: imageCount }, (_value, at) => at).filter((at) => at % every === 0);
  }
  return [...new Set(chapterImages.filter((at) => at >= 0 && at < imageCount))].toSorted(
    (left, right) => left - right,
  );
}

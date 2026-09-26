// The Video stage's optional Shorts step: the text model picks the best self-contained
// moments of the narration, each becomes a vertical 1080×1920 clip with its own images and
// big word-by-word captions, and each gets a title, a one-line description and hashtags.
// Browser-safe: Play, Edit project and the project page read these names and limits too.

export interface ShortsSettings {
  // Off keeps the numbers and prompts below, so turning it back on finds them as they were.
  readonly enabled: boolean;
  readonly count: number;
  readonly minSeconds: number;
  readonly maxSeconds: number;
  // The Shorts prompt from the library; absent or blank uses the built-in one.
  readonly prompt?: string | undefined;
  // An Image prompt from the library, the style the shorts' images are written in; absent
  // or blank uses the built-in one.
  readonly imagePrompt?: string | undefined;
}

// ceiling: the owner's numbers. Ten clips of three minutes is already half an hour of
// vertical video from one narration.
export const shortsCountMin = 1;
export const shortsCountMax = 10;
export const shortsSecondsMin = 15;
export const shortsSecondsMax = 180;

export const defaultShorts: ShortsSettings = {
  enabled: false,
  count: 3,
  minSeconds: 60,
  maxSeconds: 120,
};

// A short's title is shown over the clip on YouTube Shorts, TikTok and Reels; 60 characters
// fits all three without being cut.
export const shortTitleMax = 60;
export const shortHashtagsMin = 3;
export const shortHashtagsMax = 5;

// The name Play, Edit project and the review summary show for the prompts used when none is
// picked.
export const defaultShortsPromptName = "Built-in";

// What a project uses when no Shorts prompt from the library is picked. No keywords, so it
// never asks Play for a field.
export const defaultShortsPrompt = [
  "Pick the moments of this video that work best as vertical shorts on YouTube Shorts, TikTok and Reels.",
  "",
  "- Each short must make sense on its own, to a viewer who has not seen the rest of the video: no references to earlier parts, no setup that pays off outside the clip.",
  "- Open on a hook: the first sentence should make someone stop scrolling (a surprising fact, a question, a bold claim). Skip clips that start with filler or a transition.",
  "- End on a complete thought, not mid-argument.",
  "- Prefer the most surprising, useful or emotional moments over summaries, and don't pick two shorts that say the same thing.",
  "- Title: at most 60 characters, plain words, no clickbait and no hashtags.",
  "- Description: one line that says what the viewer learns or feels.",
  "- Hashtags: 3-5, about the subject of that clip, most specific last.",
].join("\n");

// The style the shorts' images are written in when no Image prompt from the library is
// picked.
export const defaultShortsImagePrompt = [
  "Vertical 9:16 images for a short video. Each image illustrates what is being said at that moment of the clip.",
  "Cinematic, high-contrast and uncluttered, with the subject large and centred so it reads on a phone screen.",
  "Leave the lower half calm: captions are drawn over the middle of the frame.",
  "No text, letters, logos or watermarks in the image.",
].join("\n");

// How many images a clip gets: one per `imageSeconds` of the clip, the last running to the
// end, and at least one.
export function shortImageCount(clipSeconds: number, imageSeconds: number): number {
  if (!Number.isFinite(clipSeconds) || !Number.isFinite(imageSeconds) || imageSeconds <= 0)
    return 1;
  // A few milliseconds over a whole number of images is timing noise, not another image.
  return Math.max(1, Math.ceil(clipSeconds / imageSeconds - 0.001));
}

// The most images the step can ask for: every clip at the longest length allowed. The cost
// estimate charges this before the clips are picked.
export function shortsImageUpperBound(
  settings: Pick<ShortsSettings, "count" | "maxSeconds">,
  imageSeconds: number,
): number {
  return settings.count * shortImageCount(settings.maxSeconds, imageSeconds);
}

// The words a problem with one of the numbers is said in; shared by admission, Play's draft
// conversion and Edit project.
export function shortsSettingsProblems(
  settings: Pick<ShortsSettings, "count" | "minSeconds" | "maxSeconds">,
): readonly { readonly field: "count" | "minSeconds" | "maxSeconds"; readonly message: string }[] {
  const problems: { field: "count" | "minSeconds" | "maxSeconds"; message: string }[] = [];
  const whole = (value: number, min: number, max: number): boolean =>
    Number.isInteger(value) && value >= min && value <= max;
  if (!whole(settings.count, shortsCountMin, shortsCountMax))
    problems.push({
      field: "count",
      message: `Enter a whole number of shorts between ${shortsCountMin} and ${shortsCountMax}.`,
    });
  for (const field of ["minSeconds", "maxSeconds"] as const)
    if (!whole(settings[field], shortsSecondsMin, shortsSecondsMax))
      problems.push({
        field,
        message: `Enter a whole number of seconds between ${shortsSecondsMin} and ${shortsSecondsMax}.`,
      });
  // Said against both numbers, so it shows under whichever one was just typed.
  if (
    problems.every((problem) => problem.field === "count") &&
    settings.minSeconds > settings.maxSeconds
  )
    for (const field of ["minSeconds", "maxSeconds"] as const)
      problems.push({
        field,
        message:
          "The longest a short may be must be at least the shortest. Raise the maximum or lower the minimum.",
      });
  return problems;
}

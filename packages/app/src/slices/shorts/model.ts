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
  // The short's title as a headline at the top for the whole clip. New settings start with it
  // on; absent reads as off, which is how every short was rendered before it existed.
  readonly titleOnScreen?: boolean | undefined;
  // Where the full video is, for the line each short's description ends with; absent or
  // blank leaves a placeholder to paste it into.
  readonly fullVideoLink?: string | undefined;
  // How loud the background music is under the narration, 0-100%; absent is 15%. The file
  // itself is the revision's `shortsMusic`, uploaded in Edit project.
  readonly musicVolume?: number | undefined;
  // How fast the clips play, 1.00-1.25; absent is 1. The pitch is kept.
  readonly speed?: number | undefined;
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
  titleOnScreen: true,
};

// ceiling: faster than 1.25× the narration stops sounding natural even with the pitch kept;
// the step is the smallest change a listener notices.
export const shortsSpeedMin = 1;
export const shortsSpeedMax = 1.25;
export const shortsSpeedStep = 0.05;
// Quiet enough to sit under a voice at full volume; the ducking lowers it further while
// the narrator speaks.
export const defaultMusicVolume = 15;
export const fullVideoLinkMax = 2000;

// What a short's description ends with when no link to the full video is set: a line to
// paste it into before uploading.
export const fullVideoPlaceholder = "[PASTE THE FULL VIDEO LINK HERE]";

// The line every short's description ends with, pointing viewers to the whole video.
export function fullVideoLine(link: string | undefined): string {
  const trimmed = link?.trim() ?? "";
  return `Watch the full video: ${trimmed === "" ? fullVideoPlaceholder : trimmed}`;
}

// What Copy puts on the clipboard for one short: the title, the description ending with the
// link line, and the hashtags.
export function shortUploadText(
  clip: {
    readonly title: string;
    readonly description: string;
    readonly hashtags: readonly string[];
  },
  link: string | undefined,
): string {
  return [
    clip.title,
    "",
    `${clip.description}\n${fullVideoLine(link)}`,
    "",
    clip.hashtags.join(" "),
  ].join("\n");
}

// The playback speed the render uses: the setting when it is in range, else 1.
export function shortsSpeedOf(settings: Pick<ShortsSettings, "speed">): number {
  const speed = settings.speed;
  return speed !== undefined &&
    Number.isFinite(speed) &&
    speed >= shortsSpeedMin &&
    speed <= shortsSpeedMax
    ? speed
    : 1;
}

export function musicVolumeOf(settings: Pick<ShortsSettings, "musicVolume">): number {
  const volume = settings.musicVolume;
  return volume !== undefined && Number.isFinite(volume) && volume >= 0 && volume <= 100
    ? volume
    : defaultMusicVolume;
}

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

// The later settings as Play and Edit project hold them while they are typed: the numbers
// and the link as text, blank or absent meaning not set.
export interface ShortsExtrasForm {
  readonly titleOnScreen?: boolean | undefined;
  readonly fullVideoLink?: string | undefined;
  readonly musicVolume?: string | undefined;
  readonly speed?: string | undefined;
}

// The settings the typed extras stand for. A number that doesn't read as one comes back as
// NaN, so `shortsSettingsProblems` refuses it where it was typed.
export function shortsExtrasOf(
  form: ShortsExtrasForm,
): Pick<ShortsSettings, "titleOnScreen" | "fullVideoLink" | "musicVolume" | "speed"> {
  const typed = (value: string | undefined): number | undefined =>
    value === undefined || value.trim() === "" ? undefined : Number(value);
  const musicVolume = typed(form.musicVolume);
  const speed = typed(form.speed);
  const link = form.fullVideoLink?.trim() ?? "";
  return {
    ...(form.titleOnScreen === undefined ? {} : { titleOnScreen: form.titleOnScreen }),
    ...(link === "" ? {} : { fullVideoLink: link }),
    ...(musicVolume === undefined ? {} : { musicVolume }),
    ...(speed === undefined ? {} : { speed }),
  };
}

// The same settings as the forms show them.
export function shortsExtrasForm(settings: ShortsSettings | undefined): ShortsExtrasForm {
  return {
    ...(settings?.titleOnScreen === undefined ? {} : { titleOnScreen: settings.titleOnScreen }),
    ...(settings?.fullVideoLink === undefined ? {} : { fullVideoLink: settings.fullVideoLink }),
    ...(settings?.musicVolume === undefined ? {} : { musicVolume: String(settings.musicVolume) }),
    ...(settings?.speed === undefined ? {} : { speed: settings.speed.toFixed(2) }),
  };
}

export type ShortsField =
  | "count"
  | "minSeconds"
  | "maxSeconds"
  | "speed"
  | "musicVolume"
  | "fullVideoLink";

// The words a problem with one of the settings is said in; shared by admission, Play's
// draft conversion and Edit project.
export function shortsSettingsProblems(
  settings: Pick<ShortsSettings, "count" | "minSeconds" | "maxSeconds"> &
    Partial<Pick<ShortsSettings, "speed" | "musicVolume" | "fullVideoLink">>,
): readonly { readonly field: ShortsField; readonly message: string }[] {
  const problems: { field: ShortsField; message: string }[] = [];
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
  const speed = settings.speed;
  // Steps of 0.05 from 1.00, allowing for how a typed or stored number was rounded.
  if (
    speed !== undefined &&
    (!Number.isFinite(speed) ||
      speed < shortsSpeedMin - 1e-9 ||
      speed > shortsSpeedMax + 1e-9 ||
      Math.abs(
        (speed - shortsSpeedMin) / shortsSpeedStep -
          Math.round((speed - shortsSpeedMin) / shortsSpeedStep),
      ) > 1e-6)
  )
    problems.push({
      field: "speed",
      message: "Choose a speed between 1.00× and 1.25×, in steps of 0.05.",
    });
  if (settings.musicVolume !== undefined && !whole(settings.musicVolume, 0, 100))
    problems.push({
      field: "musicVolume",
      message: "Enter the music volume as a whole number of percent between 0 and 100.",
    });
  const link = settings.fullVideoLink?.trim() ?? "";
  if (link !== "" && !webLink(link))
    problems.push({
      field: "fullVideoLink",
      message:
        "The full video link must be a whole web address starting with https:// or http://, like https://youtu.be/abc123. Paste it again, or leave the box empty.",
    });
  return problems;
}

function webLink(text: string): boolean {
  if (text.length > fullVideoLinkMax || /\s/.test(text)) return false;
  try {
    const url = new URL(text);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "";
  } catch {
    return false;
  }
}

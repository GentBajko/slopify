// An ambient sound bed under the long video: rain, fire or wind that ffmpeg makes itself from
// noise (no downloads, no bundled recordings), or the user's own audio file. It plays under the
// whole narration, ducked whenever the voice speaks, fades in at the start, and keeps playing
// for a fade-out tail after the narration ends, which lengthens the video when the tail is
// longer than the silence already there (`plan.ts`). Only the long video gets it: the shorts
// have their own background music, and the audio-only WAV export stays the narration alone.
// Browser-safe: Play, the channel page and the review summary read these names and limits too.
//
// A run without one has no `ambientBed` at all, and the render recipe leaves it out of the
// fingerprint then, so no video made before it existed turns outdated.

export const builtInBeds = ["rain", "fire", "wind"] as const;
export type BuiltInBed = (typeof builtInBeds)[number];
export const ambientBedSources = [...builtInBeds, "upload"] as const;
export type AmbientBedSource = (typeof ambientBedSources)[number];

export interface AmbientBedSettings {
  // A built-in bed, or "upload": the file is the project's `ambientBed` asset, staged on Play
  // as the draft's `provided.ambientBed`.
  readonly source: AmbientBedSource;
  // The bed's level before ducking, in dB: 0 is about as loud as a narration, so the default
  // sits well under it.
  readonly levelDb: number;
  readonly fadeInSeconds: number;
  // How long the bed keeps playing, fading out, after the narration ends.
  readonly tailSeconds: number;
}

// A channel's brand kit offers the built-in beds only: an uploaded file belongs to one run's
// draft and project, and a channel has no file store of its own for audio.
export interface ChannelAmbientBed extends AmbientBedSettings {
  readonly source: BuiltInBed;
}

export const ambientBedLabels: Readonly<Record<AmbientBedSource, string>> = {
  rain: "Rain",
  fire: "Fireplace",
  wind: "Wind",
  upload: "My own file",
};

// ceiling: below -40 dB the bed is inaudible under a voice; above -6 dB it competes with it.
export const ambientLevelMin = -40;
export const ambientLevelMax = -6;
export const ambientFadeMax = 30;
export const ambientTailMax = 30;
export const defaultAmbientBed: Omit<AmbientBedSettings, "source"> = {
  levelDb: -18,
  fadeInSeconds: 3,
  tailSeconds: 6,
};

export type AmbientBedField = "source" | "level" | "fadeIn" | "tail";

// Whether the run's long video gets the bed: it is set, the video renders and there is a
// narration to lie under.
export function usesAmbientBed(config: {
  readonly sources: { readonly video: string; readonly audio: string };
  readonly ambientBed?: AmbientBedSettings | undefined;
}): boolean {
  return (
    config.ambientBed !== undefined &&
    config.sources.video === "generate" &&
    config.sources.audio !== "off"
  );
}

// The words a problem with one of the settings is said in; shared by admission, Play's draft
// conversion and the channel page.
export function ambientBedProblems(
  bed: AmbientBedSettings,
): readonly { readonly field: AmbientBedField; readonly message: string }[] {
  const problems: { field: AmbientBedField; message: string }[] = [];
  if (!(ambientBedSources as readonly string[]).includes(bed.source))
    problems.push({
      field: "source",
      message: "Choose Rain, Fireplace, Wind or My own file for the ambient sound.",
    });
  if (
    !(
      Number.isInteger(bed.levelDb) &&
      bed.levelDb >= ambientLevelMin &&
      bed.levelDb <= ambientLevelMax
    )
  )
    problems.push({
      field: "level",
      message: `Enter an ambient sound level between ${String(ambientLevelMin)} and ${String(ambientLevelMax)} dB, in whole dB.`,
    });
  if (!halfSteps(bed.fadeInSeconds, ambientFadeMax))
    problems.push({
      field: "fadeIn",
      message: `Enter a fade-in between 0 and ${String(ambientFadeMax)} seconds, in steps of 0.5.`,
    });
  if (!halfSteps(bed.tailSeconds, ambientTailMax))
    problems.push({
      field: "tail",
      message: `Enter a tail between 0 and ${String(ambientTailMax)} seconds, in steps of 0.5.`,
    });
  return problems;
}

function halfSteps(value: number, max: number): boolean {
  return Number.isInteger(value * 2) && value >= 0 && value <= max;
}

// How much longer the video runs with the bed: the tail plays over the silence already after
// the narration (`edgeSilenceSeconds`) and only the rest is added.
export function ambientTailExtension(
  config: {
    readonly sources: { readonly video: string; readonly audio: string };
    readonly ambientBed?: AmbientBedSettings | undefined;
  },
  edgeSilenceSeconds: number,
): number {
  if (!usesAmbientBed(config) || config.ambientBed === undefined) return 0;
  return Math.max(0, config.ambientBed.tailSeconds - edgeSilenceSeconds);
}

// Play's form keeps the numbers as typed, like every other number on it; "none" is a setup
// that asks for no bed even when its channel has one.
export interface AmbientBedForm {
  readonly source: "none" | AmbientBedSource;
  readonly level: string;
  readonly fadeIn: string;
  readonly tail: string;
}

export function ambientBedFormOf(bed: AmbientBedSettings): AmbientBedForm {
  return {
    source: bed.source,
    level: String(bed.levelDb),
    fadeIn: String(bed.fadeInSeconds),
    tail: String(bed.tailSeconds),
  };
}

// The settings a form asks for, numbers as typed (NaN for a blank one), or undefined for none.
export function ambientBedOfForm(form: AmbientBedForm | undefined): AmbientBedSettings | undefined {
  if (form === undefined || form.source === "none") return undefined;
  const number = (raw: string): number => (raw.trim() === "" ? Number.NaN : Number(raw));
  return {
    source: form.source,
    levelDb: number(form.level),
    fadeInSeconds: number(form.fadeIn),
    tailSeconds: number(form.tail),
  };
}

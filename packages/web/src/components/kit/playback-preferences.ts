export const playbackRates = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

// Volume, mute and speed carry over from one player to the next and across visits, in this
// browser only: a reviewer who turned narration down, or listens at 1.5×, does not set it again
// on every clip. Storage can be missing or blocked; then every player starts at full volume, 1×.
const preferencesKey = "slopify.playback";

interface PlaybackPreferences {
  readonly volume: number;
  readonly muted: boolean;
  readonly rate: number;
}

const defaults: PlaybackPreferences = { volume: 1, muted: false, rate: 1 };

export function readPlaybackPreferences(): PlaybackPreferences {
  try {
    const raw = window.localStorage.getItem(preferencesKey);
    if (raw === null) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return defaults;
    const { volume, muted, rate } = parsed as Record<string, unknown>;
    return {
      volume: typeof volume === "number" && volume >= 0 && volume <= 1 ? volume : 1,
      muted: muted === true,
      rate: typeof rate === "number" && playbackRates.some((one) => one === rate) ? rate : 1,
    };
  } catch {
    return defaults;
  }
}

export function savePlaybackPreferences(change: Partial<PlaybackPreferences>): void {
  try {
    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({ ...readPlaybackPreferences(), ...change }),
    );
  } catch {
    // Blocked storage only means the next player starts at the defaults.
  }
}

// One sound at a time: starting a player pauses whichever other player was playing.
let sounding: HTMLMediaElement | null = null;

export function claimSound(element: HTMLMediaElement): void {
  if (sounding !== null && sounding !== element && !sounding.paused) sounding.pause();
  sounding = element;
}

export function releaseSound(element: HTMLMediaElement): void {
  if (sounding === element) sounding = null;
}

export function applyPreferences(
  element: HTMLMediaElement,
  preferences: PlaybackPreferences,
): void {
  element.volume = preferences.volume;
  element.muted = preferences.muted;
  element.playbackRate = preferences.rate;
}

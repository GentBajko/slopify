// Run sounds: a chime when a run starts and a different one when it ends, loud enough to hear
// from another room, like a message arriving on a phone. They are played by the Web Audio API
// from a few notes, so there is no file to load. A per-browser switch, on unless turned off;
// storage can be missing or throw, and every read and write here survives that.

export type RunSound = "start" | "end";

const preferenceKey = "slopify.notifications.sound";
const listeners = new Set<() => void>();

export function runSoundsOn(): boolean {
  try {
    return window.localStorage.getItem(preferenceKey) !== "off";
  } catch {
    return true;
  }
}

export function setRunSounds(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(preferenceKey);
    else window.localStorage.setItem(preferenceKey, "off");
  } catch {
    // Without storage the choice can't be kept; the switch reads back on.
  }
  for (const listener of listeners) listener();
}

export function onRunSoundsChange(listener: () => void): () => void {
  listeners.add(listener);
  const fromOtherTab = (event: StorageEvent): void => {
    if (event.key === preferenceKey) listener();
  };
  window.addEventListener("storage", fromOtherTab);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", fromOtherTab);
  };
}

// Start: two quick rising notes. End: three notes that climb and settle, longer and brighter,
// so the two are told apart without looking.
const tunes: Readonly<
  Record<RunSound, readonly (readonly [hz: number, at: number, length: number])[]>
> = {
  start: [
    [784, 0, 0.16],
    [1175, 0.14, 0.3],
  ],
  end: [
    [1047, 0, 0.18],
    [1319, 0.16, 0.18],
    [1568, 0.32, 0.55],
  ],
};

// A new player for every chime, closed once it has played: a player kept for the page's life
// can go silent for good after the sound output changes or the computer sleeps, and still say
// it is running. The browser lets a page make one only after it has been clicked once; the
// shell's unlock below wakes the page's first one on that click.
function player(): AudioContext | undefined {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return undefined;
  try {
    return new window.AudioContext();
  } catch {
    return undefined;
  }
}

// Browsers keep audio silent until the page has been clicked once; the shell calls this on the
// first click so a run that finishes later can be heard.
export function unlockRunSounds(): void {
  const ctx = player();
  if (ctx === undefined) return;
  void ctx
    .resume()
    .catch(() => {})
    .finally(() => void ctx.close().catch(() => {}));
}

export function playRunSound(sound: RunSound): void {
  const ctx = player();
  if (ctx === undefined) return;
  void (async () => {
    // Waits for the player to start, up to a moment; one the browser keeps silent stays silent.
    if (ctx.state !== "running")
      await Promise.race([
        ctx.resume().catch(() => {}),
        new Promise((done) => setTimeout(done, 400)),
      ]);
    const length = tune(ctx, sound);
    setTimeout(() => void ctx.close().catch(() => {}), (length + 0.5) * 1000);
  })();
}

// Plays the tune and says how long it lasts, in seconds.
function tune(ctx: AudioContext, sound: RunSound): number {
  const now = ctx.currentTime + 0.02;
  // Near full scale, through a limiter so the stacked partials never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.ratio.value = 12;
  limiter.connect(ctx.destination);
  for (const [hz, at, length] of tunes[sound]) {
    for (const [ratio, level, type] of [
      [1, 0.9, "sine"],
      [2, 0.25, "triangle"],
    ] as const) {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.type = type;
      tone.frequency.value = hz * ratio;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(level, now + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + length);
      tone.connect(gain).connect(limiter);
      tone.start(now + at);
      tone.stop(now + at + length + 0.05);
    }
  }
  return Math.max(...tunes[sound].map(([, at, length]) => at + length));
}

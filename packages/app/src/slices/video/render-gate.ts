// How many videos this computer renders at once (Settings → Production defaults → Videos
// rendered at once). A render decodes the whole picture track and encodes hours of it, so two
// at once cost more than twice one: they share the processor, the disk and the memory, and
// enough of them together leave the app with too little of each to answer the page.
//
// A render holds a place for as long as it runs; the rest wait their turn rather than being
// refused, so a waiting render still finishes, only later. The limit is read each time a place
// is asked for and each time one is given back, so raising it in Settings lets a waiting render
// start without a restart, and lowering it takes effect as the renders running now finish.

import { videoRenderConcurrencyMax } from "./encoding.js";

export interface RenderGate {
  // Runs `work` once a place is free, and gives the place back however it ends.
  readonly hold: <T>(work: () => Promise<T>) => Promise<T>;
}

export function createRenderGate(limit: () => number): RenderGate {
  const waiting: (() => void)[] = [];
  let active = 0;
  // A hand-edited setting cannot make the gate let everything through, or nothing.
  const allowed = (): number => {
    const asked = Math.floor(limit());
    return Number.isFinite(asked) ? Math.max(1, Math.min(videoRenderConcurrencyMax, asked)) : 1;
  };
  const drain = (): void => {
    while (active < allowed()) {
      const next = waiting.shift();
      if (next === undefined) return;
      active++;
      next();
    }
  };
  return {
    hold: async <T>(work: () => Promise<T>): Promise<T> => {
      if (active < allowed()) active++;
      else await new Promise<void>((resolve) => waiting.push(resolve));
      try {
        return await work();
      } finally {
        active--;
        drain();
      }
    },
  };
}

// The renders of a run that has no gate (a test, or an older wiring) go straight through.
export const openRenderGate: RenderGate = { hold: (work) => work() };

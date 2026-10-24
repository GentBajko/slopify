import { useEffect, useRef } from "react";

// A command run from anywhere that finishes on another screen ("New schedule" from Home,
// "Regenerate image 3 in Cleopatra" from Projects) navigates there and leaves an intent; the
// screen takes it once it is mounted and ready. An intent nobody takes within a few seconds
// is dropped, so a later visit never acts on a stale one.

const lifetimeMs = 10_000;

// The names the screens listen for.
export const intents = {
  // Its value, when there is one, is the id of the template the new schedule runs.
  newSchedule: "schedules.new",
  addToCalendar: "calendar.add",
  // Open the project on its Images section.
  showImages: (projectId: string) => `project.${projectId}.show-images`,
  // Regenerate the image numbered by the value, asking first as the Regenerate button does.
  regenerateImage: (projectId: string) => `project.${projectId}.regenerate-image`,
} as const;

interface Pending {
  readonly value: number | string | undefined;
  readonly at: number;
}

const pending = new Map<string, Pending>();
const listeners = new Set<() => void>();

export function requestIntent(name: string, value?: number | string): void {
  pending.set(name, { value, at: Date.now() });
  for (const listener of listeners) listener();
}

function take(name: string): Pending | undefined {
  const found = pending.get(name);
  pending.delete(name);
  return found === undefined || Date.now() - found.at > lifetimeMs ? undefined : found;
}

// Runs `handle` for each intent named `name`, as soon as `ready` is true. `Value` is what the
// intent's requester passes (a count, a template id).
export function useIntent<Value extends number | string = number>(
  name: string,
  handle: (value: Value | undefined) => void,
  ready = true,
): void {
  const latest = useRef(handle);
  latest.current = handle;
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      if (!pending.has(name)) return;
      const found = take(name);
      if (found !== undefined) latest.current(found.value as Value | undefined);
    };
    check();
    listeners.add(check);
    return () => {
      listeners.delete(check);
    };
  }, [name, ready]);
}

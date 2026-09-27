import type { ListingLimitWait } from "@app/slices/admission/model.js";

// How a wait for a CLI plan's limits reads wherever the project shows up: the project page,
// Home's Running now, the Projects list and the calendar all say the same words.

type WaitLike = Pick<ListingLimitWait, "name" | "resetsAt" | "retryAt">;

// "Waiting for Codex limits (resets at 14:00)", or "(checking again at 14:30)" when the CLI
// named no reset time. `clock` says how a time reads; the default adds the weekday when it is
// not today.
export function limitWaitLine(
  waits: readonly WaitLike[] | undefined,
  clock: (iso: string) => string = limitClock,
): string | undefined {
  const first = waits?.[0];
  if (waits === undefined || first === undefined) return undefined;
  const when =
    first.resetsAt === null
      ? `checking again at ${clock(first.retryAt)}`
      : `resets at ${clock(first.resetsAt)}`;
  return `Waiting for ${limitNames(waits)} limits (${when})`;
}

// "Codex", or "Codex and Claude" when stages wait on more than one plan.
export function limitNames(waits: readonly WaitLike[]): string {
  const names = [...new Set(waits.map((wait) => wait.name))];
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

// "14:00" today, "Tue 14:00" on another day.
export function limitClock(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return at.toDateString() === new Date().toDateString()
    ? time
    : `${at.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

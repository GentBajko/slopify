// A schedule's times read in the schedule's own time zone wherever they are shown (Home,
// Calendar, Releases and the schedule itself), with the zone named when it isn't this
// browser's: "8:00 PM London". An unknown zone reads in the browser's own.

export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function usable(zone: string | undefined): string | undefined {
  if (zone === undefined || zone === "") return undefined;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

// "London" for Europe/London, "New York" for America/New_York.
export function zoneName(zone: string): string {
  if (zone === "UTC" || zone === "Etc/UTC") return "UTC";
  return (zone.split("/").at(-1) ?? zone).replaceAll("_", " ");
}

function offsetAt(at: Date, zone: string): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}

// Whether a clock in `zone` reads differently from the browser's at that moment.
export function zoneDiffers(
  iso: string,
  zone: string | undefined,
  browser = browserZone(),
): boolean {
  const own = usable(zone);
  if (own === undefined) return false;
  const at = new Date(iso);
  return offsetAt(at, own) !== offsetAt(at, usable(browser) ?? "UTC");
}

export function zonedFormat(
  iso: string,
  zone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const own = usable(zone);
  return new Intl.DateTimeFormat(
    undefined,
    own === undefined ? options : { ...options, timeZone: own },
  ).format(new Date(iso));
}

// "8:00 PM", or "8:00 PM London" when London isn't the browser's zone.
export function zonedTime(iso: string, zone: string | undefined, browser = browserZone()): string {
  const time = zonedFormat(iso, zone, { timeStyle: "short" });
  return zone !== undefined && zoneDiffers(iso, zone, browser) ? `${time} ${zoneName(zone)}` : time;
}

// The zone's own calendar day, as the calendar keys its days: "2026-10-20".
export function zonedDayKey(iso: string, zone: string | undefined): string {
  const own = usable(zone);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(own === undefined ? {} : { timeZone: own }),
  }).format(new Date(iso));
}

const pad = (n: number): string => String(n).padStart(2, "0");

// A datetime-local input's value for `iso` as the zone's own wall clock: "2026-10-20T20:00".
export function zonedInput(iso: string, zone: string | undefined): string {
  const own = usable(zone);
  const at = new Date(iso);
  if (own === undefined)
    return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: own,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year ?? ""}-${parts.month ?? ""}-${parts.day ?? ""}T${parts.hour ?? ""}:${parts.minute ?? ""}`;
}

// The instant a datetime-local value means as the zone's wall clock (`zonedInput` read back).
export function fromZonedInput(value: string, zone: string | undefined): string {
  const own = usable(zone);
  if (own === undefined) return new Date(value).toISOString();
  const wall = fromWall(value);
  // The zone's offset at the guess, then at the answer: right on both sides of a clock change.
  const offset = (instant: number): number => {
    const shown = zonedInput(new Date(instant).toISOString(), own);
    return fromWall(shown) - instant;
  };
  let guess = wall - offset(wall);
  guess = wall - offset(guess);
  return new Date(guess).toISOString();
}

function fromWall(value: string): number {
  const [date = "", time = ""] = value.split("T");
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const [h = 0, min = 0] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, min);
}

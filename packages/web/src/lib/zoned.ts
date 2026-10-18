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

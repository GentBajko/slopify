// Times the way YouTube reads them in a description: M:SS under an hour, H:MM:SS from the
// first hour on. Whole seconds, rounded down, so a chapter never starts after its words.
export function youtubeTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${String(minutes)}:${rest}`;
}

// The seconds a model's M:SS, MM:SS or H:MM:SS stands for; undefined for anything else, so
// the caller can say which chapter time it could not read.
export function parseTimestamp(text: string): number | undefined {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (match === null) return undefined;
  const hours = Number(match[1] ?? "0");
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (seconds > 59 || (match[1] !== undefined && minutes > 59)) return undefined;
  return hours * 3600 + minutes * 60 + seconds;
}

// One way to write money, counts, dates and times everywhere a person compares them.

const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fractions = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

// "$0", "$0.0032" for a fraction of a cent (an audition, one image call), "$1,234.50".
export function usd(value: number): string {
  if (value === 0) return "$0";
  return Math.abs(value) < 0.01 ? fractions.format(value) : cents.format(value);
}

export const fullDay = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
export const shortTime = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
export const wholeNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
export const groupedNumber = new Intl.NumberFormat("en");

// "1 video", "3 videos"; pass the plural when it is not the singular plus "s".
export function plural(count: number, singular: string, many = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : many}`;
}

// The same with thousands separators, for counts that can pass a thousand.
export function pluralGrouped(count: number, singular: string, many = `${singular}s`): string {
  return `${groupedNumber.format(count)} ${count === 1 ? singular : many}`;
}

// "2026-10-04T20:00" in this browser's zone, for a datetime-local input.
export function localInput(iso: string): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

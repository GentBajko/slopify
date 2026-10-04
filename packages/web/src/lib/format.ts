// One way to write money and file sizes everywhere a person compares them.

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

// "512 B", "3.4 MB", "12 GB": binary units, one decimal under ten.
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unit: string = units[0];
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024 || candidate === units.at(-1)) break;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "")} ${unit}`;
}

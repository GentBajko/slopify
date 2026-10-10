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

// "512 B", "3.4 MB", "12 GB": the server's own, so an agent's confirmation reads the same.
export { fileSize } from "@app/slices/storage/consequences.js";

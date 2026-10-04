// "1,234 of 10,000 characters": a counter for a box with a limit, measured on what is typed now
// (not what was saved), in the unit the limit is enforced in.
export function limitCount(used: number, max: number, unit: string): string {
  const format = new Intl.NumberFormat("en-US");
  const over = used - max;
  const base = `${format.format(used)} of ${format.format(max)} ${unit}`;
  return over > 0 ? `${base}: ${format.format(over)} over the limit, shorten it to save.` : base;
}

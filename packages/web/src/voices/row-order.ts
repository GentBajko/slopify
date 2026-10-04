// Moves the item at `index` one place up (-1) or down (+1); out of range leaves the list as is.
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  const item = list[index];
  if (item === undefined || to < 0 || to >= list.length) return [...list];
  const next = list.filter((_one, at) => at !== index);
  next.splice(to, 0, item);
  return next;
}

// "Alex copy", then "Alex copy 2": a name not used yet, cut to `max` characters.
export function copyName(name: string, taken: readonly string[], max: number): string {
  const base = `${name.trim() || "Untitled"} copy`;
  const used = new Set(taken.map((one) => one.trim().toLowerCase()));
  let n = 1;
  let candidate = base;
  while (used.has(candidate.slice(0, max).toLowerCase())) {
    n += 1;
    candidate = `${base} ${String(n)}`;
  }
  return candidate.slice(0, max);
}

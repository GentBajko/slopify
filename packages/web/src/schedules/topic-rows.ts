// Editing a topic list in place: pasted lines become topics, rows move by position, and each row
// keeps a key of its own so a moved row keeps its field, its focus and its checkbox.

// One topic per line of pasted or typed text. List bullets ("- ", "* ", "• ") are dropped, as
// are blank lines.
export function topicLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s+/, "").trim())
    .filter((line) => line !== "");
}

// The list with the row at `from` taken out and put back at `to`, the way the server's move
// does it.
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [row] = next.splice(from, 1);
  if (row === undefined) return next;
  next.splice(Math.min(Math.max(to, 0), next.length), 0, row);
  return next;
}

export function insertedAt<T>(list: readonly T[], at: number, add: readonly T[]): T[] {
  const where = Math.min(Math.max(at, 0), list.length);
  return [...list.slice(0, where), ...add, ...list.slice(where)];
}

let lastKey = 0;
export function newKeys(count: number): string[] {
  return Array.from({ length: count }, () => {
    lastKey += 1;
    return `row-${String(lastKey)}`;
  });
}

// Keys for a list that changed somewhere else (a run took the first topic, another tab saved):
// a row keeps the key of the first unclaimed row with the same title; new rows get new keys.
export function reconcileKeys(
  before: readonly { readonly title: string }[],
  keys: readonly string[],
  after: readonly { readonly title: string }[],
): string[] {
  const free = new Map<string, string[]>();
  before.forEach((row, index) => {
    const key = keys[index];
    if (key === undefined) return;
    free.set(row.title, [...(free.get(row.title) ?? []), key]);
  });
  return after.map((row) => free.get(row.title)?.shift() ?? newKeys(1)[0] ?? "");
}

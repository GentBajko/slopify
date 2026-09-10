// Bounded UTF-16 length is conservative for providers counting Unicode characters.
// Every character survives; the split never cuts a surrogate pair.
export function splitText(text: string, limit: number): readonly string[] {
  if (!Number.isInteger(limit) || limit < 2)
    throw new Error("Text limit must be at least two characters");
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const sentences = [...window.matchAll(/[.!?]\s+|\n/g)];
    const last = sentences.at(-1);
    let cut =
      last && last.index > limit / 2
        ? last.index + last[0].length
        : Math.max(window.lastIndexOf(" "), window.lastIndexOf("\n"), window.lastIndexOf("\t")) + 1;
    if (cut < limit / 2) cut = limit;
    const code = rest.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut--;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

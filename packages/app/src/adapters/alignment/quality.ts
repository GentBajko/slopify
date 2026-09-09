// Compare acoustic recognition with the already aligned transcript. This catches extra
// speech and missing phrases even when a few forced words individually score well.
export function agreesWithSpeech(expected: string, observed: string): boolean {
  const left = expected.toUpperCase().replace(/[^A-Z']/g, "");
  const right = observed.toUpperCase().replace(/[^A-Z']/g, "");
  if (left.length === 0 || right.length === 0) return false;
  let previous = Uint16Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = new Uint16Array(right.length + 1);
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1)
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    previous = current;
  }
  return (previous[right.length] ?? Infinity) / Math.max(left.length, right.length) <= 0.42;
}

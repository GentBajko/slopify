// A word-level diff for History's side-by-side view. Browser-safe: the Library screen diffs the
// two versions it already holds. Words and the whitespace between them are the units, so a
// changed word is marked on its own and line breaks survive for the view to show.

export type DiffOp = "same" | "removed" | "added";

export interface DiffPart {
  readonly op: DiffOp;
  readonly text: string;
}

// Past this many changed words the two texts are too different for a word diff to help, and
// the Myers trace would grow with it: the view shows the one removed and the other added.
const maxEdits = 4000;

export function tokens(text: string): readonly string[] {
  return text.match(/\s+|[^\s]+/gu) ?? [];
}

// The parts of both texts in order. `same` parts belong to both sides, `removed` to the older
// text only and `added` to the newer only; neighbours of one kind are joined.
export function wordDiff(before: string, after: string): readonly DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  // The common head and tail are cut first: most edits touch a small part of a long prompt.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail += 1;
  const parts: DiffPart[] = [];
  push(parts, "same", a.slice(0, head).join(""));
  const middleA = a.slice(head, a.length - tail);
  const middleB = b.slice(head, b.length - tail);
  for (const part of myers(middleA, middleB)) push(parts, part.op, part.text);
  push(parts, "same", a.slice(a.length - tail).join(""));
  return parts;
}

// One side of the side-by-side view: the older text keeps what was removed, the newer what
// was added.
export function sideOf(parts: readonly DiffPart[], side: "before" | "after"): readonly DiffPart[] {
  const hidden: DiffOp = side === "before" ? "added" : "removed";
  return parts.filter((part) => part.op !== hidden);
}

export function diffCounts(parts: readonly DiffPart[]): {
  readonly added: number;
  readonly removed: number;
} {
  const words = (op: DiffOp) =>
    parts
      .filter((part) => part.op === op)
      .reduce((sum, part) => sum + tokens(part.text).filter((one) => one.trim() !== "").length, 0);
  return { added: words("added"), removed: words("removed") };
}

function push(parts: DiffPart[], op: DiffOp, text: string): void {
  if (text === "") return;
  const last = parts.at(-1);
  if (last !== undefined && last.op === op)
    parts[parts.length - 1] = { op, text: last.text + text };
  else parts.push({ op, text });
}

// Myers' O((N+M)D) shortest edit script, walked back from the end through the saved frontiers.
function myers(a: readonly string[], b: readonly string[]): readonly DiffPart[] {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ op: "added", text: b.join("") }];
  if (b.length === 0) return [{ op: "removed", text: a.join("") }];
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, maxEdits);
  const offset = max + 1;
  let v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d += 1) {
    trace.push(v.slice());
    const next = v.slice();
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      next[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
    v = next;
  }
  if (!found)
    return [
      { op: "removed", text: a.join("") },
      { op: "added", text: b.join("") },
    ];
  // Backtrack: each frontier in `trace` is the state before step d.
  const script: DiffPart[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const before = trace[d] ?? new Int32Array(0);
    const k = x - y;
    const down =
      k === -d || (k !== d && (before[offset + k - 1] ?? 0) < (before[offset + k + 1] ?? 0));
    const previousK = down ? k + 1 : k - 1;
    const previousX = before[offset + previousK] ?? 0;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      script.push({ op: "same", text: a[x - 1] ?? "" });
      x -= 1;
      y -= 1;
    }
    if (d > 0) {
      if (down) script.push({ op: "added", text: b[y - 1] ?? "" });
      else script.push({ op: "removed", text: a[x - 1] ?? "" });
      x = previousX;
      y = previousY;
    }
  }
  const parts: DiffPart[] = [];
  for (const part of script.reverse()) push(parts, part.op, part.text);
  return parts;
}

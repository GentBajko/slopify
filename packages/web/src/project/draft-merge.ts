import type { RevisionEdit } from "@app/slices/revisions/model.js";

type Saved = Pick<RevisionEdit, "config" | "content">;

function plain(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function merge(base: unknown, mine: unknown, latest: unknown): unknown {
  if (same(base, mine)) return latest;
  if (plain(base) && plain(mine) && plain(latest)) {
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(latest), ...Object.keys(mine)])) {
      const value = merge(base[key], mine[key], latest[key]);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  return mine;
}

// The draft's own changes laid over a newer revision: every value the draft changed from what
// it was edited from wins, and everything it left alone comes from the newer revision. Lists
// count as one value, so a reordered list is the draft's order.
export function reapplyEdit(base: Saved, mine: RevisionEdit, latest: Saved): RevisionEdit {
  return {
    ...mine,
    // The merge keeps the shapes it is given: each key comes from one of the three.
    config: merge(base.config, mine.config, latest.config) as RevisionEdit["config"],
    content: merge(base.content, mine.content, latest.content) as RevisionEdit["content"],
  };
}

function leaves(base: unknown, mine: unknown, path: string, out: string[]): void {
  if (same(base, mine)) return;
  if (plain(base) && plain(mine)) {
    for (const key of new Set([...Object.keys(base), ...Object.keys(mine)]))
      leaves(base[key], mine[key], path === "" ? key : `${path}.${key}`, out);
    return;
  }
  const text =
    mine === undefined
      ? "(removed)"
      : typeof mine === "string"
        ? mine
        : JSON.stringify(mine, null, 2);
  out.push(`${path}:\n${text}`);
}

// What the draft changed, as text to keep somewhere safe: one block per changed value.
export function describeEdit(base: Saved, mine: RevisionEdit): string {
  const out: string[] = [];
  leaves(base.config, mine.config, "config", out);
  leaves(base.content, mine.content, "content", out);
  if ((mine.regenerate?.length ?? 0) > 0)
    out.push(`Marked to make again:\n${(mine.regenerate ?? []).join("\n")}`);
  return out.length === 0 ? "No changes." : out.join("\n\n");
}

export function isRevisionEdit(value: unknown): value is RevisionEdit {
  return plain(value) && plain(value.config) && plain(value.content);
}

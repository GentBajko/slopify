import type { RebuildPreview, RebuildWork } from "./model.js";

// Remake outdated for several projects (the Projects list's selection bar, and agents through
// MCP): which projects it leaves out and why, and the single total it asks to accept.
// Browser-safe.

type Disposed = Pick<RebuildWork, "key" | "disposition" | "reason">;

export function remadeWork<W extends Pick<RebuildWork, "disposition">>(
  work: readonly W[],
): readonly W[] {
  return work.filter(
    (one) =>
      one.disposition === "generate" || one.disposition === "local" || one.disposition === "review",
  );
}

export function remakeBlocker(status: string, sample: boolean): string | undefined {
  if (status === "running") return "It is running now. Remake it once the run has finished.";
  if (sample)
    return "It is a sample project, which stays as it came with Slopify. Open it, press Make my own copy at the top of its page, then remake the copy.";
  return undefined;
}

export function previewBlocker(
  preview: Pick<RebuildPreview, "providedReuseRequired"> & { readonly work: readonly Disposed[] },
  label: (key: string) => string,
): string | undefined {
  if (remadeWork(preview.work).length === 0)
    return "Nothing in it is outdated, so there is nothing to remake.";
  const blocked = preview.work.find((work) => work.disposition === "blocked");
  if (blocked !== undefined)
    return `${label(blocked.key)} can't run: ${blocked.reason.trim() || "no reason was given."} Open the project and press Choose what to remake to see what to fix.`;
  if (preview.providedReuseRequired.length > 0)
    return "It uses content you supplied, which you confirm on the project itself: open it and press Choose what to remake.";
  return undefined;
}

export interface CostTotal {
  readonly low: number;
  readonly high: number;
  readonly unknown: number;
}

export function remakeTotal(costs: readonly CostTotal[]): CostTotal {
  return {
    low: costs.reduce((sum, one) => sum + one.low, 0),
    high: costs.reduce((sum, one) => sum + one.high, 0),
    unknown: costs.reduce((sum, one) => sum + one.unknown, 0),
  };
}

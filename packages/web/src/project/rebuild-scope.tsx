import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import type { ReactElement } from "react";
import { workName } from "./rebuild-work-names.js";

// The rebuild in four plain lines, before any detail: what is made again (and charged), what
// that then rebuilds on this computer (combining narration, rendering the video), what stays
// exactly as it is, and that a failure keeps the current version.
export function RebuildScope({
  preview,
  label,
}: {
  readonly preview: RebuildPreview;
  readonly label: (key: string) => string;
}): ReactElement {
  const of = (disposition: RebuildPreview["work"][number]["disposition"]) =>
    preview.work.filter((work) => work.disposition === disposition).map((work) => work.key);
  const made = of("generate");
  const local = of("local");
  const kept = of("reuse");
  const onPlan = preview.costs.high === 0 && preview.costs.rows.some((row) => row.onPlan === true);
  const lines = [
    made.length === 0
      ? undefined
      : `Made again${onPlan ? " on your plan" : preview.costs.high > 0 ? ", charged" : ""}: ${named(made, label)}.`,
    local.length === 0
      ? undefined
      : `${made.length === 0 ? "Rebuilt" : "Then rebuilt"} on this computer, free: ${named(local, label)}.`,
    kept.length === 0 ? undefined : `Stays as it is: ${named(kept, label)}.`,
    made.length + local.length === 0
      ? undefined
      : "If anything fails, the current version stays in use and the step can be tried again.",
  ].filter((line): line is string => line !== undefined);
  return (
    <ul aria-label="What this remake does" className="m-0 flex flex-col gap-1 pl-5 text-small">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

// "Image request 3", or "12 narration requests" when a kind repeats; at most four kinds.
export function named(keys: readonly string[], label: (key: string) => string): string {
  const groups = new Map<string, string[]>();
  for (const key of keys) groups.set(workName(key), [...(groups.get(workName(key)) ?? []), key]);
  const parts = [...groups].map(([name, members]) =>
    members.length === 1
      ? label(members[0] ?? "")
      : `${String(members.length)} ${lowerPlural(name)}`,
  );
  return parts.length <= 4
    ? parts.join(", ")
    : `${parts.slice(0, 4).join(", ")} and ${String(parts.length - 4)} more`;
}

function lowerPlural(name: string): string {
  const lower = /^[A-Z]{2}/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);
  return /s$/u.test(lower) ? lower : `${lower}s`;
}

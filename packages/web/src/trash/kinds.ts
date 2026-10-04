import type { TrashItem, TrashKind } from "@app/slices/trash/model.js";
import { keys } from "@/queries";
import { schedulesKey } from "@/schedules/api";
import { templatesKey } from "@/templates/api";

// Words and lookups Settings → Trash shares between its list, filter and dialogs.

const kindLabels: Readonly<Record<TrashKind, string>> = {
  project: "Project",
  prompt: "Prompt",
  entry: "Intro/outro",
  template: "Template",
  schedule: "Schedule",
};

// The filter's words, plural, in the order the filter shows them.
export const kindFilters: readonly { readonly value: TrashKind; readonly label: string }[] = [
  { value: "project", label: "Projects" },
  { value: "prompt", label: "Prompts" },
  { value: "entry", label: "Intros and outros" },
  { value: "template", label: "Templates" },
  { value: "schedule", label: "Schedules" },
];

// What does and does not come here, for the empty trash and the section's meta line.
export const whatComesHere =
  "Deleted projects, prompts, intros and outros, templates and schedules stay here for 30 days.";
export const whatDoesNot =
  "Channels, cast members, PDF themes and episode summaries are deleted permanently and never come here.";

export function kindOf(item: TrashItem): string {
  if (item.kind === "entry" && item.detail !== null)
    return item.detail === "intro" ? "Intro" : "Outro";
  if (item.kind === "prompt" && item.detail !== null) return `Prompt · ${item.detail}`;
  return kindLabels[item.kind];
}

export function daysLeftText(daysLeft: number): string {
  if (daysLeft <= 0) return "removed for good today";
  return daysLeft === 1 ? "1 day left" : `${String(daysLeft)} days left`;
}

const shortTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const fullTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "long",
});

// "27 Sep 2026, 10:00" on the row; the full date, time and zone on hover.
export function deletedAt(item: TrashItem): { readonly short: string; readonly full: string } {
  const at = new Date(item.deletedAt);
  return {
    short: shortTime.format(at),
    full: `Deleted ${fullTime.format(at)}. Removed for good ${fullTime.format(new Date(item.purgeAt))}.`,
  };
}

export function itemKey(item: Pick<TrashItem, "kind" | "id">): string {
  return `${item.kind}:${item.id}`;
}

// The lists an item returns to, so they show it again at once.
export const listsOf: Readonly<Record<TrashKind, readonly (readonly string[])[]>> = {
  project: [keys.projects, ["calendar"]],
  prompt: [keys.prompts],
  entry: [keys.entries],
  template: [templatesKey],
  schedule: [schedulesKey, ["calendar"]],
};

// The one-sentence consequence of removing these items for good.
export function deleteConsequence(items: readonly TrashItem[]): string {
  const projects = items.filter((item) => item.kind === "project").length;
  const schedules = items.some((item) => item.kind === "schedule");
  const parts = [
    projects === 0
      ? undefined
      : projects === 1 && items.length === 1
        ? "The project and every file it produced are removed from disk."
        : `${String(projects)} ${projects === 1 ? "project and every file it" : "projects and every file they"} produced are removed from disk.`,
    schedules ? "Deleted schedules keep their run history on Schedules." : undefined,
    "Nothing removed here can be restored. This cannot be undone.",
  ];
  return parts.filter((part) => part !== undefined).join(" ");
}

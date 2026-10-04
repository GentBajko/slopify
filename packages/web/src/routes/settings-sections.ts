// Settings is a few groups rather than fourteen equal choices. Each group is one rail item; a
// group with more than one section shows them as tabs. Every section keeps its own id, so a
// link or a `?section=` from before the groups still opens the same place.
export const settingsSections = [
  {
    id: "providers",
    label: "Providers",
    meta: "Keys stay on this machine and go only to their provider. Readiness is checked again before each run.",
  },
  {
    id: "voices",
    label: "Voices",
    meta: "A wrong voice ID shows up when the audio stage uses it.",
  },
  {
    id: "models",
    label: "Models",
    meta: "New models, prices and retirements, checked once a day.",
  },
  {
    id: "playback",
    label: "Production defaults",
    meta: "How new runs pace the narration and level the volume.",
  },
  {
    id: "notifications",
    label: "Notifications",
    meta: "When a run finishes, fails, waits for you, or a review needs a decision.",
  },
  {
    id: "channel-links",
    label: "Channel links",
    meta: "The links a YouTube description's {{Name}} placeholders fill from.",
  },
  {
    id: "studio",
    label: "YouTube Studio",
    meta: "The playlist upload packs name, and the Studio extension's pairing.",
  },
  {
    id: "storage",
    label: "Backup & storage",
    meta: "Daily backups, export and import, and what uses disk space.",
  },
  {
    id: "trash",
    label: "Trash",
    meta: "Deleted projects, prompts, intros and outros, templates and schedules, kept for 30 days. Channels, cast, PDF themes and episode summaries are deleted permanently.",
  },
  {
    id: "general",
    label: "General",
    meta: "How Slopify looks and how it starts on this computer.",
  },
  {
    id: "about",
    label: "About",
    meta: "Free and open source, running on your machine with your own keys.",
  },
  {
    id: "usage",
    label: "Usage",
    meta: "This machine only. The same counters, anonymised, feed slopify.stream.",
  },
  {
    id: "patch-notes",
    label: "Patch notes",
    meta: "What changed in each version of Slopify.",
  },
] as const;

type ListedSection = (typeof settingsSections)[number]["id"];
// "backups" was its own section; it is now part of Backup & storage.
export type SettingsSection = ListedSection | "backups";

interface SettingsGroup {
  readonly id: string;
  readonly label: string;
  readonly sections: readonly ListedSection[];
}

const connections: SettingsGroup = {
  id: "connections",
  label: "Connections",
  sections: ["providers", "voices", "models"],
};

export const settingsGroups: readonly SettingsGroup[] = [
  connections,
  { id: "production", label: "Production defaults", sections: ["playback"] },
  { id: "notifications", label: "Notifications", sections: ["notifications"] },
  { id: "publishing", label: "Publishing", sections: ["channel-links", "studio"] },
  { id: "storage", label: "Backup & storage", sections: ["storage", "trash"] },
  { id: "general", label: "General", sections: ["general"] },
  { id: "about", label: "About", sections: ["about", "usage", "patch-notes"] },
];

// The section a `?section=` value opens: an old id lands where its content went, anything
// unknown on Providers.
export function settingsSectionOf(value: unknown): ListedSection {
  if (value === "backups") return "storage";
  return settingsSections.find((section) => section.id === value)?.id ?? "providers";
}

export function groupOfSection(section: ListedSection): SettingsGroup {
  return settingsGroups.find((group) => group.sections.includes(section)) ?? connections;
}

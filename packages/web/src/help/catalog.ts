import { libraryHelp } from "./entries/library.js";
import { planningHelp } from "./entries/planning.js";
import { playHelp } from "./entries/play.js";
import { projectHelp } from "./entries/project.js";
import { settingsHelp } from "./entries/settings.js";
import type { HelpEntry } from "./entry.js";

export type { HelpEntry } from "./entry.js";

// Every info button's text, in one place. An id is `area.thing` (`play.voice`,
// `settings.backups.keep`); the area files only split the list so it stays readable. A test
// fails when an id here is used nowhere, or when a control on the main screens has no tip.
export const catalog = {
  ...playHelp,
  ...projectHelp,
  ...libraryHelp,
  ...planningHelp,
  ...settingsHelp,
} as const satisfies Readonly<Record<string, HelpEntry>>;

export type HelpId = keyof typeof catalog;

export function helpEntry(id: HelpId, vars?: Readonly<Record<string, string>>): HelpEntry {
  const entry: HelpEntry = catalog[id];
  if (vars === undefined) return entry;
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (all, name) => vars[name] ?? all);
  return { title: fill(entry.title), body: fill(entry.body) };
}

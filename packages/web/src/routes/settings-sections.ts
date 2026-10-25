// Settings is one flat list of pages, each named once: the row's name is the page's title. The
// rows come in four runs (what makes the videos, how new videos are made and published, this
// computer, Slopify itself), drawn with a little space between runs and no headings. Every page
// keeps its id, so a link or a `?section=` from before still opens the same place, and the ids
// of pages that were folded into others open the page that holds their content now.
export const settingsSections = [
  {
    id: "providers",
    label: "Keys & services",
    // What older messages and the help call this page.
    formerly: ["Providers"],
    meta: "What writes, reads aloud and draws your videos. Keys stay on this computer.",
    run: 0,
  },
  {
    id: "voices",
    label: "Voices",
    meta: "The voices you can pick for narration.",
    run: 0,
  },
  {
    id: "models",
    label: "Models",
    meta: "Which models work with your keys and sign-ins.",
    run: 0,
  },
  {
    id: "playback",
    label: "Production defaults",
    formerly: ["Template studio"],
    meta: "How new videos sound and are encoded, and what template samples may spend.",
    run: 1,
  },
  {
    id: "notifications",
    label: "Notifications",
    meta: "When a run finishes, fails or waits for you.",
    run: 1,
  },
  {
    id: "studio",
    label: "YouTube Studio and posting",
    formerly: ["YouTube Studio", "Channel links"],
    meta: "The browser extension that fills YouTube Studio, release times and playlists.",
    run: 1,
  },
  {
    id: "storage",
    label: "Backup & storage",
    meta: "Daily backups, export and import, and disk space.",
    run: 2,
  },
  {
    id: "trash",
    label: "Trash",
    meta: "What you deleted, to bring back or remove for good.",
    run: 2,
  },
  {
    id: "general",
    label: "General",
    meta: "How Slopify looks and how it starts.",
    run: 2,
  },
  {
    id: "remote-access",
    label: "Remote access",
    meta: "Open Slopify on your phone or laptop through Tailscale.",
    run: 2,
  },
  {
    id: "agents",
    label: "AI agents",
    formerly: ["Agents (MCP)"],
    meta: "Let Claude Code or Codex on this computer run Slopify for you.",
    run: 2,
  },
  {
    id: "about",
    label: "About",
    meta: "Your version, updates and where to get help.",
    run: 3,
  },
  {
    id: "usage",
    label: "Usage",
    meta: "What this computer made. Slopify always adds these counts, anonymously, to slopify.stream's totals; there is no switch.",
    run: 3,
  },
  {
    id: "patch-notes",
    label: "What's new",
    formerly: ["Patch notes"],
    meta: "What changed in each version.",
    run: 3,
  },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly formerly?: readonly string[];
  readonly meta: string;
  readonly run: number;
}[];

type ListedSection = (typeof settingsSections)[number]["id"];

// Pages that became part of another: "backups" of Backup & storage, "template-studio" (the
// sample budgets) of Production defaults, "channel-links" (now on each channel's page) of
// YouTube Studio and posting.
const folded = {
  backups: "storage",
  "template-studio": "playback",
  "channel-links": "studio",
} as const satisfies Readonly<Record<string, ListedSection>>;

export type SettingsSection = ListedSection | keyof typeof folded;

// The page a `?section=` value opens: an old id lands where its content went, anything
// unknown on Keys & services.
export function settingsSectionOf(value: unknown): ListedSection {
  if (typeof value === "string" && value in folded) return folded[value as keyof typeof folded];
  return settingsSections.find((section) => section.id === value)?.id ?? "providers";
}

// A link to a service on Keys & services (`?family=image&provider=openai-image`): that page
// brings the service's setup into view itself once its lists are in, so the router leaves the
// scroll alone for it rather than resetting to the top after the page has scrolled.
export function keysArrival(pathname: string, search: Readonly<Record<string, unknown>>): boolean {
  return (
    pathname === "/settings" &&
    settingsSectionOf(search.section) === "providers" &&
    (search.family !== undefined || search.provider !== undefined)
  );
}

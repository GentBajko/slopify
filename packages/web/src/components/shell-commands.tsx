import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useCurrentChannel } from "@/channels/current";
import { useCommand } from "@/components/kit/command-palette";
import { useToast } from "@/components/kit/toast";
import { shortcuts } from "@/lib/shortcuts";
import { settingsSections } from "@/routes/settings-sections";
import { useTutorial } from "@/tutorial/context";

// The shell's commands (Ctrl+K). An empty palette opens on "Create a video", then "Go to" in the
// rail's order and words (Home, Projects, Prompts, Templates, Calendar, Channels with two or more
// channels, Settings). Searched only: schedules, usage, tutorials, each Settings section by its
// name and the words people use for it ("appearance" lands on the section with the theme), the
// welcome screen and the tour. With two or more channels, each channel to switch to.
export function ShellCommands(): ReactElement {
  const several = useCurrentChannel().channels.length > 1;
  return (
    <>
      <NavigationCommands several={several} />
      {several ? <ChannelCommands /> : null}
      {settingsSections.map((section) => (
        <SettingsSectionCommand key={section.id} id={section.id} label={section.label} />
      ))}
      <HelpCommands />
    </>
  );
}

// Empty-palette order (kit/command-palette `rank`): Create first, then the destinations in the
// rail's order, however late one of them registered (Channels does when the channels arrive).
const rail = [
  "home",
  "projects",
  "prompts",
  "templates",
  "calendar",
  "channels",
  "settings",
] as const;
const createRank = -rail.length - 1;
const goRank = (id: (typeof rail)[number]): number => rail.indexOf(id) - rail.length;

function NavigationCommands({ several }: { readonly several: boolean }): null {
  const navigate = useNavigate();
  const go = (to: string) => () => {
    void navigate({ to });
  };
  useCommand({
    id: "create.video",
    title: "Create a video",
    group: "Create",
    rank: createRank,
    run: go("/play"),
    keywords: ["new video", "new project", "make", "start", "play"],
    shortcut: shortcuts.newVideo,
  });
  useCommand({
    id: "nav.home",
    title: "Open Home",
    group: "Go to",
    rank: goRank("home"),
    shortcut: shortcuts.goHome,
    run: go("/"),
  });
  useCommand({
    id: "nav.projects",
    title: "Open Projects",
    group: "Go to",
    rank: goRank("projects"),
    shortcut: shortcuts.goProjects,
    run: go("/projects"),
  });
  useCommand({
    id: "nav.prompts",
    title: "Open Prompts",
    group: "Go to",
    rank: goRank("prompts"),
    run: () => {
      void navigate({ to: "/prompts", search: { kind: "article" } });
    },
    keywords: ["library", "intros", "outros"],
    shortcut: shortcuts.goPrompts,
  });
  useCommand({
    id: "nav.templates",
    title: "Open Templates",
    group: "Go to",
    rank: goRank("templates"),
    run: go("/templates"),
    keywords: ["library", "designs", "posters", "setups"],
    shortcut: shortcuts.goTemplates,
  });
  useCommand({
    id: "nav.calendar",
    title: "Open Calendar",
    group: "Go to",
    rank: goRank("calendar"),
    run: go("/calendar"),
    keywords: ["schedules"],
    shortcut: shortcuts.goCalendar,
  });
  // In the rail, and so listed, only with two or more channels; found by name either way.
  useCommand({
    id: "nav.channels",
    title: "Open Channels",
    group: "Go to",
    rank: goRank("channels"),
    searchOnly: !several,
    run: go("/channels"),
    keywords: ["cast", "brand", "my channel"],
    shortcut: shortcuts.goChannels,
  });
  // Each section has its own command below, so a section's name finds the section itself.
  useCommand({
    id: "nav.settings",
    title: "Open Settings",
    group: "Go to",
    rank: goRank("settings"),
    run: go("/settings"),
    shortcut: shortcuts.goSettings,
  });
  useCommand({
    id: "nav.schedules",
    title: "Open schedules",
    group: "Go to",
    searchOnly: true,
    run: () => {
      void navigate({ to: "/calendar", search: { tab: "schedules" } });
    },
    keywords: ["calendar", "topics"],
    shortcut: shortcuts.goSchedules,
  });
  useCommand({
    id: "nav.usage",
    title: "Open usage and costs",
    group: "Go to",
    searchOnly: true,
    run: () => {
      void navigate({ to: "/settings", search: { section: "usage" } });
    },
    keywords: ["cost", "limits"],
  });
  return null;
}

// "Show all channels" and one "Switch to …" per channel, as components so the list can grow
// and shrink.
function ChannelCommand({ id, name }: { readonly id: string; readonly name: string }): null {
  const current = useCurrentChannel();
  useCommand({
    id: `channel.${id}`,
    title: `Switch to ${name}`,
    group: "Channel",
    run: () => current.setChannelId(id),
    keywords: ["channel", "switch", "filter", "showing"],
  });
  return null;
}

function ChannelCommands(): ReactElement {
  const current = useCurrentChannel();
  useCommand({
    id: "channel.all",
    title: "Show all channels",
    group: "Channel",
    run: () => current.setChannelId(null),
    keywords: ["switch", "filter", "showing"],
  });
  return (
    <>
      {current.channels.map((channel) => (
        <ChannelCommand key={channel.id} id={channel.id} name={channel.name} />
      ))}
    </>
  );
}

// Words people type for a section that its name and line do not hold. "studio" on its own is a
// word of YouTube Studio and posting's name, listed so the former name "Template studio" (now
// Production defaults) does not outrank it.
const sectionWords: Readonly<Record<string, readonly string[]>> = {
  general: ["appearance", "theme", "dark", "light", "start at login", "autostart"],
  providers: [
    "providers",
    "keys",
    "api keys",
    "sign in",
    "openai",
    "gemini",
    "antigravity",
    "agy",
    "claude",
    "codex",
  ],
  voices: ["voice id", "elevenlabs", "tts"],
  agents: ["mcp", "claude code", "codex", "agent"],
  playback: ["pace", "loudness", "volume", "narration", "template studio"],
  notifications: ["webhook", "ntfy", "alerts"],
  studio: ["studio", "extension", "playlist", "youtube"],
  storage: ["export", "import", "disk", "space"],
  backups: ["daily copy", "restore"],
  trash: ["deleted", "restore", "undelete"],
  usage: ["costs", "spending", "limits", "money"],
  "patch-notes": ["changelog", "what's new", "version"],
  about: ["licence", "version", "github"],
};

function SettingsSectionCommand({
  id,
  label,
}: {
  readonly id: (typeof settingsSections)[number]["id"];
  readonly label: string;
}): null {
  const navigate = useNavigate();
  useCommand({
    id: `settings.section.${id}`,
    title: `Open Settings: ${label}`,
    group: "Settings",
    // Not the section's description: matched letter by letter, a sentence matches nearly
    // anything typed.
    keywords: ["settings", ...(sectionWords[id] ?? [])],
    searchOnly: true,
    run: () => {
      void navigate({ to: "/settings", search: { section: id } });
    },
  });
  return null;
}

function HelpCommands(): null {
  const navigate = useNavigate();
  const tutorial = useTutorial();
  const notify = useToast();
  useCommand({
    id: "nav.tutorials",
    title: "Open tutorials",
    group: "Help",
    searchOnly: true,
    run: () => {
      void navigate({ to: "/help/tutorials/$page", params: { page: "Home" } });
    },
    keywords: ["help", "guide", "wiki", "docs", "how"],
  });
  useCommand({
    id: "help.welcome",
    title: "Open the welcome screen",
    group: "Help",
    keywords: ["welcome", "getting started", "samples", "first run", "onboarding", "intro"],
    searchOnly: true,
    run: () => {
      void navigate({ to: "/welcome" });
    },
  });
  useCommand({
    id: "help.tutorial",
    title: "Start the tour",
    group: "Help",
    keywords: ["interactive tutorial", "guide", "walkthrough", "first video", "learn", "help"],
    searchOnly: true,
    run: () => {
      if (tutorial === undefined) return;
      if (tutorial.active) notify("The tour is already running.", "info");
      else tutorial.start();
    },
  });
  return null;
}

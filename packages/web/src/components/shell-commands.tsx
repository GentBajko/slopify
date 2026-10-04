import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useCurrentChannel } from "@/channels/current";
import { useCommand } from "@/components/kit/command-palette";
import { useToast } from "@/components/kit/toast";
import { shortcuts } from "@/lib/shortcuts";
import { settingsSections } from "@/routes/settings-sections";
import { useTutorial } from "@/tutorial/context";

// The shell's commands (Ctrl+K): every destination, the Create key, each channel, each
// Settings section by its name and the words people use for it ("appearance" lands on the
// section with the theme, not on Providers), the welcome
// screen and the interactive tutorial.
export function ShellCommands(): ReactElement {
  return (
    <>
      <NavigationCommands />
      <ChannelCommands />
      {settingsSections.map((section) => (
        <SettingsSectionCommand key={section.id} id={section.id} label={section.label} />
      ))}
      <HelpCommands />
    </>
  );
}

function NavigationCommands(): null {
  const navigate = useNavigate();
  const current = useCurrentChannel();
  const go = (to: string) => () => {
    void navigate({ to });
  };
  useCommand({
    id: "nav.home",
    title: "Open home",
    group: "Go to",
    shortcut: shortcuts.goHome,
    run: go("/"),
  });
  useCommand({
    id: "nav.channels",
    title: "Open channels",
    group: "Go to",
    run: go("/channels"),
    keywords: ["cast", "brand"],
    shortcut: shortcuts.goChannels,
  });
  useCommand({
    id: "nav.schedules",
    title: "Open schedules",
    group: "Go to",
    run: () => {
      void navigate({ to: "/calendar", search: { tab: "schedules" } });
    },
    keywords: ["calendar", "topics"],
    shortcut: shortcuts.goSchedules,
  });
  useCommand({
    id: "channel.all",
    title: "Show all channels",
    group: "Channel",
    run: () => current.setChannelId(null),
    keywords: ["switch", "filter"],
  });
  useCommand({
    id: "create.video",
    title: "Create",
    group: "Create",
    run: go("/play"),
    keywords: ["new project", "play", "make", "start"],
    shortcut: shortcuts.newVideo,
  });
  useCommand({
    id: "nav.projects",
    title: "Open projects",
    group: "Go to",
    shortcut: shortcuts.goProjects,
    run: go("/projects"),
  });
  useCommand({
    id: "nav.calendar",
    title: "Open calendar",
    group: "Go to",
    run: go("/calendar"),
    keywords: ["schedules"],
    shortcut: shortcuts.goCalendar,
  });
  useCommand({
    id: "nav.library",
    title: "Open library",
    group: "Go to",
    run: go("/prompts"),
    keywords: ["prompts", "templates"],
    shortcut: shortcuts.goLibrary,
  });
  // Each section has its own command below, so a section's name finds the section itself.
  useCommand({
    id: "nav.settings",
    title: "Open settings",
    group: "Go to",
    run: go("/settings"),
    shortcut: shortcuts.goSettings,
  });
  useCommand({
    id: "nav.tutorials",
    title: "Open tutorials",
    group: "Go to",
    run: () => {
      void navigate({ to: "/help/tutorials/$page", params: { page: "Home" } });
    },
    keywords: ["help", "guide", "wiki", "docs", "how"],
  });
  useCommand({
    id: "nav.usage",
    title: "Open usage and costs",
    group: "Go to",
    run: () => {
      void navigate({ to: "/settings", search: { section: "usage" } });
    },
    keywords: ["cost", "limits"],
  });
  return null;
}

// One command per channel, as a component so the list can grow and shrink.
function ChannelCommand({ id, name }: { readonly id: string; readonly name: string }): null {
  const current = useCurrentChannel();
  useCommand({
    id: `channel.${id}`,
    title: `Switch to ${name}`,
    group: "Channel",
    run: () => current.setChannelId(id),
    keywords: ["channel", "switch", "filter"],
  });
  return null;
}

function ChannelCommands(): ReactElement {
  const current = useCurrentChannel();
  return (
    <>
      {current.channels.map((channel) => (
        <ChannelCommand key={channel.id} id={channel.id} name={channel.name} />
      ))}
    </>
  );
}

// Words people type for a section that its name and line do not hold.
const sectionWords: Readonly<Record<string, readonly string[]>> = {
  general: ["appearance", "theme", "dark", "light", "start at login", "autostart"],
  providers: ["api keys", "sign in", "openai", "gemini", "claude", "codex"],
  voices: ["voice id", "elevenlabs", "tts"],
  playback: ["pace", "loudness", "volume", "narration"],
  notifications: ["webhook", "ntfy", "alerts"],
  studio: ["extension", "playlist", "youtube"],
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
    title: "Start the interactive tutorial",
    group: "Help",
    keywords: ["tour", "guide", "walkthrough", "first video", "learn", "help"],
    searchOnly: true,
    run: () => {
      if (tutorial === undefined) return;
      if (tutorial.active) notify("The interactive tutorial is already running.", "info");
      else tutorial.start();
    },
  });
  return null;
}

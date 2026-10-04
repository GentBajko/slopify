import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { channelsQuery } from "@/channels/api";
import { useCommand, useCommandPalette } from "@/components/kit/command-palette";
import { categoryLabel } from "@/lib/entry-options";
import { kindLabel } from "@/lib/prompt-kinds";
import { documentThemesQuery, entriesQuery, promptsQuery } from "@/queries";
import { schedulesQuery } from "@/schedules/api";
import { templatesQuery } from "@/templates/api";

// The palette finds the Library and the plans by name, not only projects: "Edit prompt
// Documentary dossier", "Open schedule Weekly myths", "Open channel History". They are searched,
// never listed in an empty palette. The lists are read the first time the palette opens (most
// visits never open it), then kept fresh by the screens that use them.

interface Entity {
  readonly id: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly go: () => void;
}

export function EntityCommands(): ReactElement {
  const { api } = useApp();
  const navigate = useNavigate();
  const palette = useCommandPalette();
  const wanted = { enabled: palette.open };
  const prompts = useQuery({ ...promptsQuery(api), ...wanted });
  const entries = useQuery({ ...entriesQuery(api), ...wanted });
  const themes = useQuery({ ...documentThemesQuery(api), ...wanted });
  const schedules = useQuery({ ...schedulesQuery(api), ...wanted });
  const templates = useQuery({ ...templatesQuery(api), ...wanted });
  const channels = useQuery({ ...channelsQuery(api), ...wanted });

  const all: Entity[] = [
    ...(channels.data ?? []).map((channel) => ({
      id: `channel.open.${channel.id}`,
      title: `Open channel ${channel.name}`,
      keywords: ["channel", "brand", "cast", "episodes"],
      go: () => {
        void navigate({ to: "/channels/$channelId", params: { channelId: channel.id } });
      },
    })),
    ...(schedules.data ?? []).map((schedule) => ({
      id: `schedule.open.${schedule.id}`,
      title: `Open schedule ${schedule.name}`,
      keywords: ["schedule", "topics", "calendar", "plan"],
      go: () => {
        void navigate({
          to: "/calendar",
          search: { tab: "schedules", schedule: schedule.id },
        });
      },
    })),
    ...(templates.data ?? []).map((template) => ({
      id: `template.open.${template.id}`,
      title: `Open template ${template.name}`,
      keywords: ["template", "setup", "library", "find"],
      // Templates shows the one in `?item=` beside the list.
      go: () => {
        void navigate({ to: "/templates", search: { item: template.id } });
      },
    })),
    ...(prompts.data?.prompts ?? []).map((prompt) => ({
      id: `prompt.edit.${prompt.id}`,
      title: `Edit prompt ${prompt.name}`,
      keywords: ["prompt", "library", kindLabel(prompt.kind)],
      go: () => {
        void navigate({ to: "/prompts/$promptId", params: { promptId: prompt.id } });
      },
    })),
    ...(entries.data?.entries ?? []).map((entry) => ({
      id: `entry.edit.${entry.id}`,
      title: `Edit ${categoryLabel(entry.category).toLowerCase()} ${entry.name}`,
      keywords: ["intro", "outro", "library"],
      go: () => {
        void navigate({ to: "/entries/$entryId", params: { entryId: entry.id } });
      },
    })),
    ...(themes.data?.themes ?? []).map((theme) => ({
      id: `theme.edit.${theme.id}`,
      title: `Edit PDF theme ${theme.name}`,
      keywords: ["document", "pdf", "theme", "library"],
      go: () => {
        void navigate({ to: "/document-themes/$themeId", params: { themeId: theme.id } });
      },
    })),
  ];
  return (
    <>
      {all.map((entity) => (
        <EntityCommand key={entity.id} entity={entity} />
      ))}
    </>
  );
}

function EntityCommand({ entity }: { readonly entity: Entity }): null {
  useCommand({
    id: entity.id,
    title: entity.title,
    group: "Library and plans",
    keywords: entity.keywords,
    searchOnly: true,
    run: entity.go,
  });
  return null;
}

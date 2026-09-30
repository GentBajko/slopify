import { queryOptions } from "@tanstack/react-query";
import type { Api } from "./api.js";
import {
  listDocumentThemes,
  listEntries,
  listProjects,
  listPrompts,
  listProviders,
  listStaged,
  listVoices,
  readAppSettings,
  readNarrationAliases,
  readNotice,
  readProject,
  readRunCost,
  readUsage,
} from "./api.js";

// One place names a cache key, so an SSE handler and the query it invalidates cannot
// drift apart.
export const keys = {
  projects: ["projects"] as const,
  revisions: (id: string) => ["project", id, "revisions"] as const,
  revision: (id: string, revisionId: string) => ["project", id, "revision", revisionId] as const,
  revisionFile: (id: string, revisionId: string, recordId: string) =>
    ["revision-file", id, revisionId, recordId] as const,
  project: (id: string) => ["project", id] as const,
  // Under the project's key, so every event that refetches the project refetches this too.
  runCost: (id: string) => ["project", id, "run-cost"] as const,
  // The text `article.delta` appends to. It is patched, never fetched.
  article: (id: string, revisionId: string | null = null) =>
    ["project", id, "article", revisionId] as const,
  audioPreview: (id: string, revisionId: string | null) =>
    ["audio-preview", id, revisionId] as const,
  // One of a project's own files, read as text. The output's id is in the key rather than
  // its asset name because a re-run replaces an output rather than versioning it: an edited
  // article is a new row, so the key changes and the new text is fetched without anything
  // having to remember to invalidate the old one.
  file: (projectId: string, outputId: string) => ["file", projectId, outputId] as const,
  staging: ["staging"] as const,
  notice: ["notice"] as const,
  usage: ["usage"] as const,
  providers: ["providers"] as const,
  voices: ["voices"] as const,
  prompts: ["prompts"] as const,
  entries: ["entries"] as const,
  documentThemes: ["document-themes"] as const,
  narrationAliases: ["narration-aliases"] as const,
  settings: ["settings"] as const,
  // The project page's hand edits to the YouTube description, and the channel links: the
  // older Settings list alone, or a project's channel's (under the same prefix, so saving a
  // channel refreshes both).
  youtubeEdits: (projectId: string) => ["project", projectId, "youtube-edits"] as const,
  channelLinks: ["channel-links"] as const,
  projectChannelLinks: (projectId: string) => ["channel-links", "project", projectId] as const,
};

// Live events keep these fresh (`events.ts`); while something runs they are also looked at
// again every 15 seconds, so a missed event never leaves a page behind until a refresh.
const whileRunningMs = 15_000;
const active = new Set(["running", "pending"]);

export function projectsQuery(api: Api) {
  return queryOptions({
    queryKey: keys.projects,
    queryFn: () => listProjects(api),
    refetchInterval: (query) =>
      query.state.data?.projects.some((project) => active.has(project.status)) === true
        ? whileRunningMs
        : false,
  });
}

export function projectQuery(api: Api, id: string) {
  return queryOptions({
    queryKey: keys.project(id),
    queryFn: () => readProject(api, id),
    refetchInterval: (query) =>
      query.state.data !== undefined && active.has(query.state.data.project.status)
        ? whileRunningMs
        : false,
  });
}

export function runCostQuery(api: Api, id: string) {
  return queryOptions({ queryKey: keys.runCost(id), queryFn: () => readRunCost(api, id) });
}

export function stagingQuery(api: Api) {
  return queryOptions({ queryKey: keys.staging, queryFn: () => listStaged(api) });
}

export function noticeQuery(api: Api) {
  return queryOptions({ queryKey: keys.notice, queryFn: () => readNotice(api) });
}

export function usageQuery(api: Api) {
  return queryOptions({ queryKey: keys.usage, queryFn: () => readUsage(api) });
}

export function providersQuery(api: Api) {
  return queryOptions({ queryKey: keys.providers, queryFn: () => listProviders(api) });
}

export function voicesQuery(api: Api) {
  return queryOptions({ queryKey: keys.voices, queryFn: () => listVoices(api) });
}

export function promptsQuery(api: Api) {
  return queryOptions({ queryKey: keys.prompts, queryFn: () => listPrompts(api) });
}

export function entriesQuery(api: Api) {
  return queryOptions({ queryKey: keys.entries, queryFn: () => listEntries(api) });
}

export function documentThemesQuery(api: Api) {
  return queryOptions({ queryKey: keys.documentThemes, queryFn: () => listDocumentThemes(api) });
}

export function narrationAliasesQuery(api: Api) {
  return queryOptions({
    queryKey: keys.narrationAliases,
    queryFn: () => readNarrationAliases(api),
  });
}

export function settingsQuery(api: Api) {
  return queryOptions({ queryKey: keys.settings, queryFn: () => readAppSettings(api) });
}

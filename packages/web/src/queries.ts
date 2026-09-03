import { queryOptions } from "@tanstack/react-query";
import type { Api } from "./api.js";
import {
  listEntries,
  listProjects,
  listPrompts,
  listProviders,
  listStaged,
  listVoices,
  readAppSettings,
  readNotice,
  readProject,
} from "./api.js";

// One place names a cache key, so an SSE handler and the query it invalidates cannot
// drift apart.
export const keys = {
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  // The text `article.delta` appends to. It is patched, never fetched.
  article: (id: string) => ["project", id, "article"] as const,
  // One of a project's own files, read as text. The output's id is in the key rather than
  // its asset name because `logic/12` §Q106 replaces an output rather than versioning it:
  // an edited article is a new row, so the key changes and the new text is fetched without
  // anything having to remember to invalidate the old one.
  file: (projectId: string, outputId: string) => ["file", projectId, outputId] as const,
  staging: ["staging"] as const,
  notice: ["notice"] as const,
  providers: ["providers"] as const,
  voices: ["voices"] as const,
  prompts: ["prompts"] as const,
  entries: ["entries"] as const,
  settings: ["settings"] as const,
};

export function projectsQuery(api: Api) {
  return queryOptions({ queryKey: keys.projects, queryFn: () => listProjects(api) });
}

export function projectQuery(api: Api, id: string) {
  return queryOptions({ queryKey: keys.project(id), queryFn: () => readProject(api, id) });
}

export function stagingQuery(api: Api) {
  return queryOptions({ queryKey: keys.staging, queryFn: () => listStaged(api) });
}

export function noticeQuery(api: Api) {
  return queryOptions({ queryKey: keys.notice, queryFn: () => readNotice(api) });
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

export function settingsQuery(api: Api) {
  return queryOptions({ queryKey: keys.settings, queryFn: () => readAppSettings(api) });
}

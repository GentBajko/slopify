import { queryOptions } from "@tanstack/react-query";
import type { Api } from "./api.js";
import { listProjects, listStaged, readNotice, readProject } from "./api.js";

// One place names a cache key, so an SSE handler and the query it invalidates cannot
// drift apart.
export const keys = {
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  // The text `article.delta` appends to. It is patched, never fetched.
  article: (id: string) => ["project", id, "article"] as const,
  staging: ["staging"] as const,
  notice: ["notice"] as const,
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

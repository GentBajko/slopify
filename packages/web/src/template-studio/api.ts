import {
  type StudioChecks,
  type StudioView,
  studioChecksSchema,
  studioViewSchema,
} from "@app/slices/template-studio/schema.js";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { failure, understood } from "@/http";

// Library → Templates → Open studio reads one template's studio: its sections, samples and
// free checks (`/api/template-studio`, not the YouTube Studio pack's `/api/studio`).
export const templateStudioKey = (id: string) => ["template-studio", id] as const;

export async function readTemplateStudio(api: Api, id: string): Promise<StudioView> {
  const response = await api.fetch(`${api.origin}/api/template-studio/${encodeURIComponent(id)}`);
  if (!response.ok) throw await failure(response);
  return understood(studioViewSchema, await response.json());
}

export function templateStudioQuery(api: Api, id: string): UseQueryOptions<StudioView> {
  return { queryKey: templateStudioKey(id), queryFn: () => readTemplateStudio(api, id) };
}

// The free checks, read apart from the studio: they wait on the providers' readiness, which
// takes seconds, and the studio never waits for them.
export function templateChecksQuery(api: Api, id: string): UseQueryOptions<StudioChecks> {
  return {
    queryKey: [...templateStudioKey(id), "checks"],
    queryFn: async () => {
      const response = await api.fetch(
        `${api.origin}/api/template-studio/${encodeURIComponent(id)}/checks`,
      );
      if (!response.ok) throw await failure(response);
      return understood(studioChecksSchema, await response.json());
    },
  };
}

// Make samples: queues the free samples of the template's current version.
export async function requestFreeSamples(api: Api, id: string): Promise<void> {
  const response = await api.fetch(
    `${api.origin}/api/template-studio/${encodeURIComponent(id)}/free-samples`,
    { method: "POST" },
  );
  if (!response.ok) throw await failure(response);
}

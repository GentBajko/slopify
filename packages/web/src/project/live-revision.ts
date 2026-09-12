import { useQuery } from "@tanstack/react-query";
import type { ProjectBody } from "@/api";
import { keys } from "@/queries";

export function useProjectRevision(projectId: string): string | null {
  const current = useQuery<ProjectBody, Error, string | null>({
    queryKey: keys.project(projectId),
    enabled: false,
    select: (body) => body.revisionId ?? null,
  });
  return current.data ?? null;
}

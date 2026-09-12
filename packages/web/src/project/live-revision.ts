import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { projectQuery } from "@/queries";

export function useProjectRevision(projectId: string): string | null {
  const { api } = useApp();
  const current = useQuery({
    ...projectQuery(api, projectId),
    enabled: false,
    select: (body) => body.revisionId ?? null,
  });
  return current.data ?? null;
}

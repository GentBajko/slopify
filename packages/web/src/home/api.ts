import type { WeekSummary } from "@app/slices/run-cost/week.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { read } from "@/http";

export type { WeekSummary };

export const weekKey = ["home", "week"] as const;

// Monday 00:00 of this week, in the viewer's own time zone.
export function startOfWeek(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday);
  return start;
}

export function weekQuery(api: Api, since: string, channelId: string | null) {
  return queryOptions({
    queryKey: [...weekKey, since, channelId],
    queryFn: async () => {
      const query = new URLSearchParams({ since });
      if (channelId !== null) query.set("channelId", channelId);
      return read<WeekSummary>(await api.fetch(`${api.origin}/api/home/week?${query.toString()}`));
    },
    staleTime: 30_000,
  });
}

// "Mark uploaded" and its undo.
export async function markUploaded(
  api: Api,
  projectId: string,
  uploaded: boolean,
): Promise<{ readonly uploadedAt: string | null }> {
  return read(
    await api.fetch(`${api.origin}/api/projects/${encodeURIComponent(projectId)}/uploaded`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uploaded }),
    }),
  );
}

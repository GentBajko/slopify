import type { AutopilotView } from "@app/slices/autopilot/model.js";
import type { WeekSummary } from "@app/slices/run-cost/week.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { read } from "@/http";

export type { AutopilotView, WeekSummary };

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

// Needs you's "Keep as is" and its undo: the waiting run is left as it is until the next edit.
export async function setAside(
  api: Api,
  projectId: string,
  aside: boolean,
): Promise<{ readonly setAside: boolean }> {
  return read(
    await api.fetch(`${api.origin}/api/projects/${encodeURIComponent(projectId)}/set-aside`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setAside: aside }),
    }),
  );
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

export const autopilotKey = ["home", "autopilot"] as const;

// How far ahead the schedules are and what may stop them; the server answers from its hourly
// check, so this never waits for a CLI.
export function autopilotQuery(api: Api, channelId: string | null) {
  return queryOptions({
    queryKey: [...autopilotKey, channelId],
    queryFn: async () => {
      const query = channelId === null ? "" : `?channelId=${encodeURIComponent(channelId)}`;
      return read<AutopilotView>(await api.fetch(`${api.origin}/api/home/autopilot${query}`));
    },
    staleTime: 60_000,
  });
}

// Hide: the warning stays hidden for a week, or until it changes.
export async function hideWarning(api: Api, key: string): Promise<{ readonly until: string }> {
  return read(
    await api.fetch(`${api.origin}/api/home/autopilot/snooze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    }),
  );
}

export const weeklyReportKey = ["settings", "weekly-report"] as const;

export async function readWeeklyReport(api: Api): Promise<{ readonly enabled: boolean }> {
  return read(await api.fetch(`${api.origin}/api/home/autopilot/weekly`));
}

// Settings → Notifications → Weekly report.
export async function setWeeklyReport(
  api: Api,
  enabled: boolean,
): Promise<{ readonly enabled: boolean }> {
  return read(
    await api.fetch(`${api.origin}/api/home/autopilot/weekly`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),
  );
}

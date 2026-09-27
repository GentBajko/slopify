import type {
  ScheduleCreate,
  ScheduleRun,
  ScheduleSummary,
  ScheduleUpdate,
} from "@app/slices/schedules/model.js";
import {
  type Calendar,
  calendarSchema,
  type HeldTopic,
  heldTopicSchema,
  scheduleRunSchema,
  scheduleSummarySchema,
} from "@app/slices/schedules/schema.js";
import type { UseQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { Api } from "@/api";
import { errorOf, understood } from "@/http";

const problemSchema = z.object({
  title: z.string(),
  detail: z.string().optional(),
  reason: z.string().optional(),
});
const summaryBody = z.object({ schedules: z.array(scheduleSummarySchema) });
const detailBody = z.object({ schedule: scheduleSummarySchema, runs: z.array(scheduleRunSchema) });
const root = (api: Api): string => `${api.origin}/api/schedules`;

export type ScheduleReply<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string; readonly reason: string };

async function responseOf<T>(response: Response, schema: z.ZodType<T>): Promise<ScheduleReply<T>> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw errorOf(response, undefined);
  }
  if (response.ok) return { ok: true, value: understood(schema, raw) };
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) throw errorOf(response, undefined);
  const message = parsed.data.detail ?? parsed.data.title;
  if (![400, 404, 409].includes(response.status)) throw new Error(message);
  return { ok: false, message, reason: parsed.data.reason ?? "invalid-request" };
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const schedulesKey = ["schedules"] as const;

export function schedulesQuery(api: Api): UseQueryOptions<readonly ScheduleSummary[]> {
  return {
    queryKey: schedulesKey,
    queryFn: async () => {
      const reply = await responseOf(await api.fetch(root(api)), summaryBody);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value.schedules;
    },
    refetchInterval: 30_000,
  };
}

export async function readSchedule(
  api: Api,
  id: string,
): Promise<
  ScheduleReply<{ readonly schedule: ScheduleSummary; readonly runs: readonly ScheduleRun[] }>
> {
  return responseOf(await api.fetch(`${root(api)}/${encodeURIComponent(id)}`), detailBody);
}

export async function createSchedule(
  api: Api,
  input: ScheduleCreate,
): Promise<ScheduleReply<ScheduleSummary>> {
  return responseOf(await api.fetch(root(api), json("POST", input)), scheduleSummarySchema);
}

export async function updateSchedule(
  api: Api,
  id: string,
  input: Omit<ScheduleUpdate, "id">,
): Promise<ScheduleReply<ScheduleSummary>> {
  return responseOf(
    await api.fetch(`${root(api)}/${encodeURIComponent(id)}`, json("PUT", input)),
    scheduleSummarySchema,
  );
}

export async function scheduleAction(
  api: Api,
  id: string,
  action: "pause" | "resume" | "cancel",
  baseVersion: number,
): Promise<ScheduleReply<ScheduleSummary>> {
  return responseOf(
    await api.fetch(
      `${root(api)}/${encodeURIComponent(id)}/${action}`,
      json("POST", { baseVersion }),
    ),
    scheduleSummarySchema,
  );
}

export async function deleteSchedule(
  api: Api,
  id: string,
  baseVersion: number,
): Promise<ScheduleReply<{ readonly deleted: true }>> {
  return responseOf(
    await api.fetch(`${root(api)}/${encodeURIComponent(id)}`, json("DELETE", { baseVersion })),
    z.object({ deleted: z.literal(true) }),
  );
}

// Topic generation and the held topics waiting for approval.
const heldBody = z.object({ topics: z.array(heldTopicSchema) });

export const heldTopicsKey = (id: string) => ["schedule", id, "held-topics"] as const;

export async function readHeldTopics(
  api: Api,
  id: string,
): Promise<ScheduleReply<readonly HeldTopic[]>> {
  const reply = await responseOf(
    await api.fetch(`${root(api)}/${encodeURIComponent(id)}/topics/held`),
    heldBody,
  );
  return reply.ok ? { ok: true, value: reply.value.topics } : reply;
}

const topicPath = (api: Api, id: string, rest: string): string =>
  `${root(api)}/${encodeURIComponent(id)}/topics/${rest}`;

export async function generateTopicsNow(
  api: Api,
  id: string,
): Promise<ScheduleReply<{ readonly started: true }>> {
  return responseOf(
    await api.fetch(topicPath(api, id, "generate"), json("POST", {})),
    z.object({ started: z.literal(true) }),
  );
}

export async function approveHeldTopic(
  api: Api,
  id: string,
  topicId: string,
  title?: string,
): Promise<ScheduleReply<ScheduleSummary>> {
  return responseOf(
    await api.fetch(
      topicPath(api, id, `held/${encodeURIComponent(topicId)}/approve`),
      json("POST", title === undefined ? {} : { title }),
    ),
    scheduleSummarySchema,
  );
}

export async function approveAllHeldTopics(
  api: Api,
  id: string,
): Promise<ScheduleReply<ScheduleSummary>> {
  return responseOf(
    await api.fetch(topicPath(api, id, "held/approve-all"), json("POST", {})),
    scheduleSummarySchema,
  );
}

export async function rejectHeldTopic(
  api: Api,
  id: string,
  topicId: string,
): Promise<ScheduleReply<ScheduleSummary>> {
  return responseOf(
    await api.fetch(
      topicPath(api, id, `held/${encodeURIComponent(topicId)}/reject`),
      json("POST", {}),
    ),
    scheduleSummarySchema,
  );
}

export async function editHeldTopic(
  api: Api,
  id: string,
  topicId: string,
  title: string,
): Promise<ScheduleReply<HeldTopic>> {
  return responseOf(
    await api.fetch(
      topicPath(api, id, `held/${encodeURIComponent(topicId)}`),
      json("PUT", { title }),
    ),
    heldTopicSchema,
  );
}

// Reordering a queue, which is also what reorders the calendar.
export async function moveTopic(
  api: Api,
  id: string,
  input: { readonly baseVersion: number; readonly from: number; readonly to: number },
): Promise<ScheduleReply<ScheduleSummary>> {
  return responseOf(
    await api.fetch(topicPath(api, id, "move"), json("POST", input)),
    scheduleSummarySchema,
  );
}

// The whole queue as the schedule page's inline list edits it; nothing else about the schedule
// changes.
export async function replaceTopics(
  api: Api,
  id: string,
  input: { readonly baseVersion: number; readonly items: ScheduleSummary["items"] },
): Promise<ScheduleReply<ScheduleSummary>> {
  return responseOf(
    await api.fetch(`${root(api)}/${encodeURIComponent(id)}/topics`, json("PUT", input)),
    scheduleSummarySchema,
  );
}

export async function transferTopic(
  api: Api,
  id: string,
  input: {
    readonly baseVersion: number;
    readonly index: number;
    readonly targetId: string;
    readonly position?: number;
  },
): Promise<ScheduleReply<{ readonly source: ScheduleSummary; readonly target: ScheduleSummary }>> {
  return responseOf(
    await api.fetch(topicPath(api, id, "transfer"), json("POST", input)),
    z.object({ source: scheduleSummarySchema, target: scheduleSummarySchema }),
  );
}

export const calendarKey = ["calendar"] as const;

export function calendarQuery(api: Api, from: string, to: string): UseQueryOptions<Calendar> {
  return {
    queryKey: [...calendarKey, from, to],
    queryFn: async () => {
      const query = new URLSearchParams({ from, to });
      const reply = await responseOf(
        await api.fetch(`${api.origin}/api/calendar?${query.toString()}`),
        calendarSchema,
      );
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
    refetchInterval: 30_000,
  };
}

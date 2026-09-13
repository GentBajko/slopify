import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { requestHash } from "../play-drafts/repo.js";
import { nextOccurrence } from "./calendar.js";
import type { ScheduleDeps, ScheduleResult } from "./model.js";
import {
  deleteScheduleRow,
  insertSchedule,
  runsForSchedule,
  scheduleById,
  scheduleRows,
  setScheduleStatus,
  updateScheduleRow,
} from "./repo.js";
import {
  type ScheduleCreate,
  type ScheduleRun,
  type ScheduleSummary,
  scheduleControlSchema,
  scheduleCreateSchema,
  scheduleDeleteSchema,
  scheduleUpdateSchema,
} from "./schema.js";

export function listSchedules(deps: ScheduleDeps): readonly ScheduleSummary[] {
  return scheduleRows(deps.db);
}

export function listScheduleRuns(
  deps: ScheduleDeps,
  id: string,
): ScheduleResult<readonly ScheduleRun[]> {
  if (!z.uuid().safeParse(id).success) return { ok: false, reason: "invalid-input" };
  if (!scheduleById(deps.db, id)) return { ok: false, reason: "not-found" };
  return { ok: true, value: runsForSchedule(deps.db, id) };
}

export function createSchedule(
  deps: ScheduleDeps,
  input: unknown,
): ScheduleResult<ScheduleSummary> {
  const parsed = scheduleCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const checked = checkTemplate(deps, parsed.data.templateId, parsed.data.templateVersion);
  if (!checked.ok) return checked;
  const now = deps.clock.now();
  const next = nextOccurrence(parsed.data.cadence, parsed.data.timezone, now);
  if (next === null) return { ok: false, reason: "not-due" };
  const value = summary(parsed.data, next.toISOString(), now.toISOString());
  const hash = requestHash(parsed.data);
  return transact(deps.db, () => {
    const old = deps.db.prepare("SELECT creation_hash FROM schedules WHERE id=?").get(value.id);
    if (old !== undefined) {
      const oldHash = z.object({ creation_hash: z.string() }).parse(old).creation_hash;
      return oldHash === hash
        ? { ok: true, value: scheduleById(deps.db, value.id) as ScheduleSummary }
        : { ok: false, reason: "conflict" };
    }
    insertSchedule(deps.db, value, hash);
    return { ok: true, value };
  });
}

export function updateSchedule(
  deps: ScheduleDeps,
  input: unknown,
): ScheduleResult<ScheduleSummary> {
  const parsed = scheduleUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const previous = scheduleById(deps.db, parsed.data.id);
  if (!previous) return { ok: false, reason: "not-found" };
  if (previous.version !== parsed.data.baseVersion) return { ok: false, reason: "conflict" };
  if (previous.status === "canceled") return { ok: false, reason: "conflict" };
  const checked = checkTemplate(deps, parsed.data.templateId, parsed.data.templateVersion);
  if (!checked.ok) return checked;
  const now = deps.clock.now();
  const next =
    previous.status === "active"
      ? nextOccurrence(parsed.data.cadence, parsed.data.timezone, now)
      : previous.nextRunAt === null
        ? null
        : nextOccurrence(parsed.data.cadence, parsed.data.timezone, now);
  const value = summary(
    parsed.data,
    next?.toISOString() ?? null,
    now.toISOString(),
    previous.status,
    previous.version + 1,
  );
  const hash = requestHash(parsed.data);
  return transact(deps.db, () => {
    const row = deps.db
      .prepare("SELECT mutation_id,mutation_hash FROM schedules WHERE id=?")
      .get(value.id);
    if (row !== undefined) {
      const saved = z
        .object({ mutation_id: z.string().nullable(), mutation_hash: z.string().nullable() })
        .parse(row);
      if (saved.mutation_id === parsed.data.mutationId)
        return saved.mutation_hash === hash
          ? { ok: true, value: scheduleById(deps.db, value.id) as ScheduleSummary }
          : { ok: false, reason: "conflict" };
    }
    if (!updateScheduleRow(deps.db, value, parsed.data.mutationId, hash, parsed.data.baseVersion))
      return { ok: false, reason: "conflict" };
    return { ok: true, value };
  });
}

export function pauseSchedule(deps: ScheduleDeps, input: unknown): ScheduleResult<ScheduleSummary> {
  return control(deps, input, "paused");
}

export function resumeSchedule(
  deps: ScheduleDeps,
  input: unknown,
): ScheduleResult<ScheduleSummary> {
  const parsed = scheduleControlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const previous = scheduleById(deps.db, parsed.data.id);
  if (!previous) return { ok: false, reason: "not-found" };
  if (previous.version !== parsed.data.baseVersion || previous.status !== "paused")
    return { ok: false, reason: "conflict" };
  const next = nextOccurrence(previous.cadence, previous.timezone, deps.clock.now());
  const status = next === null ? "completed" : "active";
  if (
    !setScheduleStatus(
      deps.db,
      previous.id,
      previous.version,
      status,
      next?.toISOString() ?? null,
      deps.clock.now().toISOString(),
    )
  )
    return { ok: false, reason: "conflict" };
  return { ok: true, value: scheduleById(deps.db, previous.id) as ScheduleSummary };
}

export function cancelSchedule(
  deps: ScheduleDeps,
  input: unknown,
): ScheduleResult<ScheduleSummary> {
  return control(deps, input, "canceled");
}

export function deleteSchedule(
  deps: ScheduleDeps,
  input: unknown,
): ScheduleResult<{ readonly deleted: true }> {
  const parsed = scheduleDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const previous = scheduleById(deps.db, parsed.data.id);
  if (!previous) return { ok: false, reason: "not-found" };
  if (previous.version !== parsed.data.baseVersion) return { ok: false, reason: "conflict" };
  return transact(deps.db, () =>
    deleteScheduleRow(deps.db, previous.id, previous.version)
      ? { ok: true, value: { deleted: true } }
      : { ok: false, reason: "conflict" },
  );
}

function control(
  deps: ScheduleDeps,
  input: unknown,
  status: "paused" | "canceled",
): ScheduleResult<ScheduleSummary> {
  const parsed = scheduleControlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const previous = scheduleById(deps.db, parsed.data.id);
  if (!previous) return { ok: false, reason: "not-found" };
  if (previous.version !== parsed.data.baseVersion || previous.status !== "active")
    return { ok: false, reason: "conflict" };
  const next = status === "canceled" ? null : previous.nextRunAt;
  if (
    !setScheduleStatus(
      deps.db,
      previous.id,
      previous.version,
      status,
      next,
      deps.clock.now().toISOString(),
    )
  )
    return { ok: false, reason: "conflict" };
  return { ok: true, value: scheduleById(deps.db, previous.id) as ScheduleSummary };
}

function checkTemplate(
  deps: ScheduleDeps,
  id: string,
  version: number,
): ScheduleResult<ScheduleSummary> | { readonly ok: true; readonly value: true } {
  const template = deps.template(id, version);
  if (!template) return { ok: false, reason: "missing-template" };
  const sources = template.document.form.sources;
  const mediaSources = ["audio", "images", "thumbnail"] as const;
  if (mediaSources.some((kind) => sources[kind] === "provide"))
    return { ok: false, reason: "unsupported-media" };
  return { ok: true, value: true };
}

function summary(
  input: ScheduleCreate,
  nextRunAt: string | null,
  now: string,
  status: ScheduleSummary["status"] = "active",
  version = 1,
): ScheduleSummary {
  return {
    id: input.id,
    name: input.name,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    cadence: input.cadence,
    timezone: input.timezone,
    missedPolicy: input.missedPolicy,
    overlapPolicy: input.overlapPolicy,
    spendLimitCents: input.spendLimitCents,
    items: input.items,
    status,
    version,
    nextRunAt,
    createdAt: now,
    updatedAt: now,
  };
}

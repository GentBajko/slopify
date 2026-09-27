import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { requestHash } from "../play-drafts/repo.js";
import { nextOccurrence } from "./calendar.js";
import type { ScheduleDeps, ScheduleResult } from "./model.js";
import {
  insertSchedule,
  runsForSchedule,
  scheduleById,
  scheduleRows,
  setScheduleStatus,
  tombstoneScheduleRow,
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
  topicStateIdle,
} from "./schema.js";
import { type TopicRow, templateKeywords, topicRowProblems } from "./topic-list.js";

export function listSchedules(deps: ScheduleDeps): readonly ScheduleSummary[] {
  return scheduleRows(deps.db);
}

export function listScheduleRuns(
  deps: ScheduleDeps,
  id: string,
): ScheduleResult<readonly ScheduleRun[]> {
  if (!z.uuid().safeParse(id).success) return { ok: false, reason: "invalid-input" };
  const runs = runsForSchedule(deps.db, id);
  if (!scheduleById(deps.db, id) && runs.length === 0) return { ok: false, reason: "not-found" };
  return { ok: true, value: runs };
}

export function createSchedule(
  deps: ScheduleDeps,
  input: unknown,
): ScheduleResult<ScheduleSummary> {
  const parsed = scheduleCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const hash = requestHash(parsed.data);
  return transact(deps.db, () => {
    const old = deps.db
      .prepare("SELECT creation_hash,deleted_at FROM schedules WHERE id=?")
      .get(parsed.data.id);
    if (old !== undefined) {
      const saved = z
        .object({ creation_hash: z.string(), deleted_at: z.string().nullable() })
        .parse(old);
      if (saved.deleted_at !== null) return { ok: false, reason: "conflict" };
      return saved.creation_hash === hash
        ? { ok: true, value: scheduleById(deps.db, parsed.data.id) as ScheduleSummary }
        : { ok: false, reason: "conflict" };
    }
    const checked = checkTemplate(deps, parsed.data.templateId, parsed.data.templateVersion);
    if (!checked.ok) return checked;
    const topics = checkTopics(deps, parsed.data, []);
    if (!topics.ok) return topics;
    const now = deps.clock.now();
    const next = nextOccurrence(parsed.data.cadence, parsed.data.timezone, now);
    if (next === null) return { ok: false, reason: "not-due" };
    const value = summary(parsed.data, next.toISOString(), now.toISOString());
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
  const hash = requestHash(parsed.data);
  return transact(deps.db, () => {
    const previous = scheduleById(deps.db, parsed.data.id);
    if (!previous) return { ok: false, reason: "not-found" };
    const row = deps.db
      .prepare("SELECT mutation_id,mutation_hash FROM schedules WHERE id=?")
      .get(previous.id);
    if (row !== undefined) {
      const saved = z
        .object({ mutation_id: z.string().nullable(), mutation_hash: z.string().nullable() })
        .parse(row);
      if (saved.mutation_id === parsed.data.mutationId)
        return saved.mutation_hash === hash
          ? { ok: true, value: previous }
          : { ok: false, reason: "conflict" };
    }
    if (previous.deletedAt !== null) return { ok: false, reason: "conflict" };
    if (previous.version !== parsed.data.baseVersion) return { ok: false, reason: "conflict" };
    if (previous.status === "canceled" || previous.status === "completed")
      return { ok: false, reason: "conflict" };
    const checked = checkTemplate(deps, parsed.data.templateId, parsed.data.templateVersion);
    if (!checked.ok) return checked;
    const topics = checkTopics(deps, parsed.data, previous.items);
    if (!topics.ok) return topics;
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
      // Saving clears a recorded generation failure, so the next tick tries again.
      { ...previous.topics, failedAt: null, error: null },
    );
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
  if (previous.deletedAt !== null) return { ok: false, reason: "conflict" };
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
  if (previous.deletedAt !== null) return { ok: true, value: { deleted: true } };
  if (previous.version !== parsed.data.baseVersion) return { ok: false, reason: "conflict" };
  if (previous.status !== "completed" && previous.status !== "canceled")
    return { ok: false, reason: "cancel-required" };
  const deletedAt = deps.clock.now().toISOString();
  return transact(deps.db, () =>
    tombstoneScheduleRow(deps.db, previous.id, previous.version, deletedAt)
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
  if (previous.deletedAt !== null) return { ok: false, reason: "conflict" };
  if (
    previous.version !== parsed.data.baseVersion ||
    (previous.status !== "active" && !(status === "canceled" && previous.status === "paused"))
  )
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
  const { form } = template.document;
  // A supplied file is attached again on Play, which a scheduled run cannot do; the shorts'
  // background music is one too.
  if (
    mediaSources.some((kind) => sources[kind] === "provide") ||
    (form.shorts?.enabled === true && form.provided.shortsMusic) ||
    (sources.images === "generate" && form.reference?.source === "provide")
  )
    return { ok: false, reason: "unsupported-media" };
  return { ok: true, value: true };
}

// The queue's keywords must be the template's: a topic (or an every-run value) naming a keyword
// the template doesn't use would silently do nothing. Topics saved before, unchanged, are left
// alone, so a queue from before this check still saves.
function checkTopics(
  deps: ScheduleDeps,
  input: ScheduleCreate,
  kept: readonly TopicRow[],
): ScheduleResult<ScheduleSummary> | { readonly ok: true; readonly value: true } {
  const template = deps.template(input.templateId, input.templateVersion);
  if (!template) return { ok: false, reason: "missing-template" };
  const keywords = templateKeywords(template.document.form);
  const named = keywords.length === 0 ? "none" : keywords.map((one) => `“${one}”`).join(", ");
  const problems: string[] = [];
  if (input.topicKeyword !== null && !keywords.includes(input.topicKeyword))
    problems.push(
      `The topic keyword “${input.topicKeyword}” is not in this template (its keywords are ${named}). Pick another under Each topic fills.`,
    );
  for (const keyword of Object.keys(input.values))
    if (!keywords.includes(keyword))
      problems.push(
        `“${keyword}” (for every run) is not a keyword of this template (its keywords are ${named}). Remove it, or pick the template that uses it.`,
      );
  problems.push(
    ...topicRowProblems(input.items, { keywords, topicKeyword: input.topicKeyword, kept }),
  );
  if (problems.length === 0) return { ok: true, value: true };
  const shown = problems.slice(0, 5);
  const more = problems.length - shown.length;
  return {
    ok: false,
    reason: "invalid-topics",
    message: `The schedule wasn't saved. ${shown.join(" ")}${more > 0 ? ` And ${String(more)} more like these.` : ""}`,
  };
}

function summary(
  input: ScheduleCreate,
  nextRunAt: string | null,
  now: string,
  status: ScheduleSummary["status"] = "active",
  version = 1,
  topics: ScheduleSummary["topics"] = topicStateIdle,
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
    topicKeyword: input.topicKeyword,
    values: input.values,
    brief: input.brief === null || input.brief === "" ? null : input.brief,
    topicGeneration: input.topicGeneration,
    topics,
    status,
    version,
    nextRunAt,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

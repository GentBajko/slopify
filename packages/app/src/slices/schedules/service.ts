import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { requestHash } from "../play-drafts/repo.js";
import { checkDesign } from "./design-check.js";
import type { ScheduleDeps, ScheduleResult } from "./model.js";
import { nextRunOf } from "./next-run.js";
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
import { scheduleKeywords, type TopicRow, topicRowProblems } from "./topic-list.js";

export function listSchedules(deps: ScheduleDeps): readonly ScheduleSummary[] {
  const rows = scheduleRows(deps.db);
  const gateOf = deps.templateGate;
  if (gateOf === undefined) return rows;
  return rows.map((schedule) => {
    // The template studio's gate is a project template's; a design schedule's template is
    // a design template, readied by the designs.
    if (schedule.templateKind !== "project") return schedule;
    const templateGate = gateOf(schedule.templateId);
    return templateGate === undefined ? schedule : { ...schedule, templateGate };
  });
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
    const checked = checkKind(deps, parsed.data, []);
    if (!checked.ok) return checked;
    const now = deps.clock.now();
    const next = nextRunOf(deps.db, parsed.data, now);
    // A design schedule with no row still to come waits for rows; any other has to run.
    if (next === null && parsed.data.templateKind === "project")
      return { ok: false, reason: "not-due" };
    // The version it was saved against, for the record; runs use the newest.
    const value = summary(
      { ...parsed.data, templateVersion: checked.value },
      next?.toISOString() ?? null,
      now.toISOString(),
    );
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
    if (parsed.data.templateKind !== previous.templateKind)
      return {
        ok: false,
        reason: "invalid-input",
        message:
          "A schedule can't switch between making videos and making designed pieces. Make a new schedule for the other kind.",
      };
    const checked = checkKind(deps, parsed.data, previous.items);
    if (!checked.ok) return checked;
    const now = deps.clock.now();
    const next =
      previous.status === "active"
        ? nextRunOf(deps.db, parsed.data, now)
        : previous.nextRunAt === null && previous.templateKind === "project"
          ? null
          : nextRunOf(deps.db, parsed.data, now);
    // The version it was saved against, for the record; runs use the newest.
    const value = summary(
      { ...parsed.data, templateVersion: checked.value },
      next?.toISOString() ?? null,
      now.toISOString(),
      previous.status,
      previous.version + 1,
      // Saving clears a recorded generation failure, so the next tick tries again.
      { ...previous.topics, failedAt: null, error: null },
      previous.topicScoring,
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
  const next = nextRunOf(deps.db, previous, deps.clock.now());
  // A design schedule with no row to come stays active, waiting for rows.
  const status = next === null && previous.templateKind === "project" ? "completed" : "active";
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

// Answers the template's newest version when a schedule may use it, and checks its queue
// against that template: a project template's keywords, or a design template's fields and
// dates.
function checkKind(
  deps: ScheduleDeps,
  input: ScheduleCreate,
  kept: readonly TopicRow[],
):
  | Extract<ScheduleResult<ScheduleSummary>, { ok: false }>
  | { readonly ok: true; readonly value: number } {
  if (input.templateKind === "design") return checkDesign(deps, input);
  // Exactly as before design schedules: a project template's id is a UUID, and its schedule
  // runs once, daily or weekly.
  if (!z.uuid().safeParse(input.templateId).success || input.cadence.kind === "by-date")
    return { ok: false, reason: "invalid-input" };
  const checked = checkTemplate(deps, input.templateId);
  if (!checked.ok) return checked;
  const topics = checkTopics(deps, input, kept);
  if (!topics.ok) return topics;
  return checked;
}

// Answers the template's newest version when a schedule may use it.
function checkTemplate(
  deps: ScheduleDeps,
  id: string,
):
  | Extract<ScheduleResult<ScheduleSummary>, { ok: false }>
  | { readonly ok: true; readonly value: number } {
  const template = deps.template(id);
  if (!template) return { ok: false, reason: "missing-template" };
  const sources = template.document.form.sources;
  const mediaSources = ["audio", "images", "thumbnail"] as const;
  const { form } = template.document;
  // A supplied file is attached again on Play, which a scheduled run cannot do; the shorts'
  // background music is one too, and so is the ambient bed's own file.
  if (
    mediaSources.some((kind) => sources[kind] === "provide") ||
    (form.shorts?.enabled === true && form.provided.shortsMusic) ||
    form.ambientBed?.source === "upload" ||
    (sources.images === "generate" && form.reference?.source === "provide")
  )
    return { ok: false, reason: "unsupported-media" };
  return { ok: true, value: template.version };
}

// The queue's keywords must be the template's: a topic (or an every-run value) naming a keyword
// the template doesn't use would silently do nothing. Topics saved before, unchanged, are left
// alone, so a queue from before this check still saves.
function checkTopics(
  deps: ScheduleDeps,
  input: ScheduleCreate,
  kept: readonly TopicRow[],
): ScheduleResult<ScheduleSummary> | { readonly ok: true; readonly value: true } {
  const keywords = scheduleKeywords(deps, input.templateId);
  if (keywords === undefined) return { ok: false, reason: "missing-template" };
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
  topicScoring: ScheduleSummary["topicScoring"] = "off",
): ScheduleSummary {
  return {
    id: input.id,
    name: input.name,
    templateKind: input.templateKind,
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
    releases: input.releases,
    topicScoring: input.topicScoring ?? topicScoring,
    topics,
    status,
    version,
    nextRunAt,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

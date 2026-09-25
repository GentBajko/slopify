import { z } from "zod";
import { cadenceSchema, validTimeZone } from "./calendar.js";

const id = z.uuid();
const keywordName = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value === value.trim(), "Keyword names cannot start or end with spaces.");
const values = z.record(keywordName, z.string().max(10000)).readonly();
// A queued topic. Each run takes the first one and removes it once its project starts.
// `values` is only filled on schedules saved before topics had one keyword.
const item = z
  .object({
    title: z.string().trim().min(1).max(200),
    values,
  })
  .strict()
  .readonly();
const policy = z.enum(["skip", "run-once"]);
// Enough for a year of daily runs, pasted as one list.
export const queueMax = 500;
export const scheduleCreateSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(200),
    templateId: id,
    templateVersion: z.number().int().positive(),
    cadence: cadenceSchema,
    timezone: z.string().min(1).max(100).refine(validTimeZone, "Choose a valid IANA timezone."),
    missedPolicy: policy.default("skip"),
    overlapPolicy: z.literal("skip").default("skip"),
    spendLimitCents: z.number().int().nonnegative().nullable().default(null),
    items: z.array(item).max(queueMax).default([]).readonly(),
    // The template keyword each queued topic fills, such as "Topic".
    topicKeyword: keywordName.nullable().default(null),
    // Keywords every run uses as they are, such as the word counts.
    values: values.default({}),
  })
  .strict()
  .readonly();
export const scheduleUpdateSchema = scheduleCreateSchema
  .unwrap()
  .extend({ baseVersion: z.number().int().positive(), mutationId: id })
  .strict()
  .readonly();
export const scheduleDeleteSchema = z
  .object({ id, baseVersion: z.number().int().positive() })
  .strict()
  .readonly();
export const scheduleControlSchema = z
  .object({ id, baseVersion: z.number().int().positive() })
  .strict()
  .readonly();
export const scheduleSummarySchema = z
  .object({
    id,
    name: z.string(),
    templateId: id,
    templateVersion: z.number().int().positive(),
    cadence: cadenceSchema,
    timezone: z.string(),
    missedPolicy: policy,
    overlapPolicy: z.literal("skip"),
    spendLimitCents: z.number().int().nonnegative().nullable(),
    items: z.array(item).readonly(),
    topicKeyword: z.string().nullable().default(null),
    values: values.default({}),
    status: z.enum(["active", "paused", "completed", "canceled"]),
    version: z.number().int().positive(),
    nextRunAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deletedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .readonly();
export const scheduleRunSchema = z
  .object({
    id,
    scheduleId: id,
    scheduledFor: z.string().datetime({ offset: true }),
    status: z.enum(["running", "succeeded", "failed", "skipped"]),
    requestId: id.nullable(),
    projectIds: z.array(z.string()).readonly(),
    estimate: z.unknown().nullable(),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }).nullable(),
    error: z.string().nullable(),
  })
  .strict()
  .readonly();
export type ScheduleCreate = z.infer<typeof scheduleCreateSchema>;
export type ScheduleUpdate = z.infer<typeof scheduleUpdateSchema>;
export type ScheduleSummary = z.infer<typeof scheduleSummarySchema>;
export type ScheduleRun = z.infer<typeof scheduleRunSchema>;

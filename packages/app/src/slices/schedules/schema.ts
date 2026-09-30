import { z } from "zod";
import { projectStates, stageKinds } from "../../kernel/pipeline.js";
import { thinkingModes } from "../../kernel/ports/llm.js";
import { cadenceSchema, validTimeZone } from "./calendar.js";

const id = z.uuid();
// What a project on the calendar waits on the person for: a failed or paused run, or a review
// (a checkpoint holding the run, or an automatic review's failed item).
export const calendarNeeds = ["failed", "paused", "review"] as const;
export type CalendarNeed = (typeof calendarNeeds)[number];
const keywordName = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) => value === value.trim(),
    "Remove the spaces at the start or end of the keyword name.",
  );
const values = z.record(keywordName, z.string().max(10000)).readonly();
// A queued topic. Each run takes the first one and removes it once its project starts.
// `values` is only filled on schedules saved before topics had one keyword.
export const topicTitleSchema = z.string().trim().min(1).max(200);
const item = z
  .object({
    title: topicTitleSchema,
    values,
  })
  .strict()
  .readonly();
const policy = z.enum(["skip", "run-once"]);
export const topicModes = ["off", "queue", "hold"] as const;
export const topicMinDefault = 10;
export const briefMax = 4000;
// Whether a schedule asks an LLM for topics when its queue runs low, and whether they join the
// queue at once or wait for approval. `llm` is null for the template's own LLM.
export const topicGenerationSchema = z
  .object({
    mode: z.enum(topicModes),
    keepAtLeast: z.number().int().min(1).max(100),
    llm: z
      .object({
        provider: z.string().min(1).max(100),
        model: z.string().min(1).max(200),
        thinking: z.enum(thinkingModes).optional(),
      })
      .strict()
      .readonly()
      .nullable(),
  })
  .strict()
  .readonly();
export type TopicGeneration = z.infer<typeof topicGenerationSchema>;
export const topicGenerationOff: TopicGeneration = {
  mode: "off",
  keepAtLeast: topicMinDefault,
  llm: null,
};
const topicState = z
  .object({
    held: z.number().int().nonnegative(),
    generatingSince: z.string().nullable(),
    generatedAt: z.string().nullable(),
    failedAt: z.string().nullable(),
    error: z.string().nullable(),
  })
  .strict()
  .readonly();
export const topicStateIdle: z.infer<typeof topicState> = {
  held: 0,
  generatingSince: null,
  generatedAt: null,
  failedAt: null,
  error: null,
};
// Enough for a year of daily runs, pasted as one list.
export const queueMax = 500;
export const scheduleCreateSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(200),
    templateId: id,
    templateVersion: z.number().int().positive(),
    cadence: cadenceSchema,
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine(validTimeZone, "Choose a time zone from the list, such as Europe/London."),
    missedPolicy: policy.default("skip"),
    overlapPolicy: z.literal("skip").default("skip"),
    spendLimitCents: z.number().int().nonnegative().nullable().default(null),
    items: z.array(item).max(queueMax).default([]).readonly(),
    // The template keyword each queued topic fills, such as "Topic".
    topicKeyword: keywordName.nullable().default(null),
    // Keywords every run uses as they are, such as the word counts.
    values: values.default({}),
    // What the channel covers, its style and what makes a topic worth watching. Only topic
    // generation reads it.
    brief: z.string().trim().max(briefMax).nullable().default(null),
    topicGeneration: topicGenerationSchema.default(topicGenerationOff),
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
    brief: z.string().nullable().default(null),
    topicGeneration: topicGenerationSchema.default(topicGenerationOff),
    // The generation's own state: how many topics wait for approval, whether an LLM is being
    // asked now, and the last failure's plain reason (cleared by the next success).
    topics: topicState.default(topicStateIdle),
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
// `values` are the keywords the person set on a held topic before approving it; they go with it
// into the queue. Absent from a reply of a Slopify before they existed: none.
export const heldTopicSchema = z
  .object({
    id,
    title: z.string(),
    values: z.record(z.string(), z.string()).readonly().default({}),
    rank: z.number().int(),
    createdAt: z.string(),
  })
  .strict()
  .readonly();
// Edit on a held topic: its title, and its keywords when given (replacing the ones it had).
export const heldTopicEditSchema = z
  .object({ title: z.string(), values: z.record(keywordName, z.string()).optional() })
  .strict();
export type HeldTopic = z.infer<typeof heldTopicSchema>;
// Reordering is by position against the version the person saw, so a run taking the first
// topic meanwhile makes the move refuse instead of moving the wrong one.
export const topicMoveSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();
// The whole queue at once: the schedule page adds, renames, removes and reorders topics in
// place, and Undo puts the queue back as it was.
export const topicQueueSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    items: z.array(item).max(queueMax).readonly(),
  })
  .strict()
  .readonly();
// The calendar: what will run, what is running or finished, and what waits in the batch queue.
// `topicSource` says where a run's topic comes from: the queue (`topic` names it), topics held
// for approval, a generation still to come, or none (the template as saved).
export const calendarRunSchema = z
  .object({
    at: z.string(),
    scheduleId: id,
    scheduleName: z.string(),
    scheduleVersion: z.number().int().positive(),
    paused: z.boolean(),
    templateId: id,
    templateVersion: z.number().int().positive(),
    templateName: z.string().nullable(),
    // The topic's position in the schedule's queue, for reordering; null without one.
    index: z.number().int().nonnegative().nullable(),
    topic: z.string().nullable(),
    topicSource: z.enum(["queued", "held", "generated", "template"]),
    // The project title this run will get, the way the scheduler builds it; null when it can't
    // be known yet (a topic still to be approved or generated, or a deleted template). Older
    // servers leave it out.
    renderedTitle: z.string().nullable().default(null),
    // The project prepared ahead for this run (Prepare), which its day continues. Older servers
    // leave it out.
    prepared: z.string().nullable().default(null),
  })
  .strict()
  .readonly();
export const calendarProjectSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    state: z.enum(projectStates),
    createdAt: z.string(),
    finishedAt: z.string().nullable(),
    scheduleId: z.string().nullable(),
    // What the project waits on the person for; left out when nothing.
    needs: z.enum(calendarNeeds).optional(),
    // Finished, makes a video, not marked uploaded and not a bundled sample.
    readyToUpload: z.literal(true).optional(),
    // Stages waiting for a CLI plan's limits to reset.
    limitWaits: z
      .array(
        z
          .object({
            name: z.string(),
            stage: z.enum(stageKinds),
            resetsAt: z.string().nullable(),
            retryAt: z.string(),
          })
          .strict()
          .readonly(),
      )
      .readonly()
      .optional(),
  })
  .strict()
  .readonly();
export const calendarQueuedSchema = z
  .object({
    projectId: z.string(),
    title: z.string(),
    batchId: z.string(),
    position: z.number().int(),
    state: z.enum(["queued", "active"]),
    queuedAt: z.string(),
  })
  .strict()
  .readonly();
export const calendarSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    runs: z.array(calendarRunSchema).readonly(),
    projects: z.array(calendarProjectSchema).readonly(),
    queued: z.array(calendarQueuedSchema).readonly(),
  })
  .strict()
  .readonly();
export type CalendarRun = z.infer<typeof calendarRunSchema>;
export type Calendar = z.infer<typeof calendarSchema>;
// A calendar covers at most this many days per request.
export const calendarMaxDays = 92;
export const topicTransferSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    index: z.number().int().nonnegative(),
    targetId: id,
    // Where it lands in the other schedule's queue; the end when left out.
    position: z.number().int().nonnegative().optional(),
  })
  .strict()
  .readonly();

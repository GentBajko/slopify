import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { calendarRange } from "../../slices/schedules/agenda.js";
import type { ScheduleDeps, ScheduleResult } from "../../slices/schedules/model.js";
import {
  calendarMaxDays,
  calendarSchema,
  heldTopicEditSchema,
  heldTopicSchema,
  queueMax,
  scheduleCreateSchema,
  scheduleRunSchema,
  scheduleSummarySchema,
  scheduleUpdateSchema,
  topicMoveSchema,
  topicTransferSchema,
} from "../../slices/schedules/schema.js";
import {
  cancelSchedule,
  createSchedule,
  deleteSchedule,
  listScheduleRuns,
  listSchedules,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
} from "../../slices/schedules/service.js";
import {
  approveHeldTopics,
  editHeldTopic,
  heldTopics,
  moveTopic,
  rejectHeldTopic,
  transferTopic,
} from "../../slices/schedules/topics.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const id = z.object({ id: z.uuid() });
const topicParam = z.object({ id: z.uuid(), topicId: z.string().min(1).max(100) });
function refused(c: Context, result: Extract<ScheduleResult<never>, { ok: false }>): Response {
  const status = ["not-found", "missing-template", "topic-not-found"].includes(result.reason)
    ? 404
    : [
          "conflict",
          "cancel-required",
          "spend-limit",
          "unsupported-media",
          "queue-full",
          "busy",
        ].includes(result.reason)
      ? 409
      : 400;
  const detail: Record<string, string> = {
    "invalid-input": "Some schedule settings are not valid. Check each field and save again.",
    "not-found":
      "This schedule no longer exists; it may have been deleted. Reload the page to see your schedules.",
    conflict:
      "This schedule changed while you were editing, possibly because a run just started. Reload the page to see the latest, then make your change again.",
    "cancel-required":
      "This schedule is still active. Cancel it first, then delete it. Completed schedules can be deleted straight away.",
    "missing-template":
      "The template you picked was deleted or changed. Choose a template again, then save.",
    "unsupported-media":
      "This template uses audio, images, a thumbnail, shorts background music or an ambient sound file you supplied, so it cannot run on a schedule: a scheduled run has no one to attach the file again. Pick a template that generates these instead, or on Play remove the music under Outputs → Export → More shorts options (or pick Rain, Fireplace or Wind under Outputs → Export → Ambient sound) and save the template again.",
    "not-due": "This one-off time has already passed. Choose a time in the future.",
    "spend-limit":
      "The estimated cost is above this schedule's spend limit, or some prices are unknown. Raise the spend limit or choose models with known prices.",
    readiness:
      "A provider this template needs is not ready, for example a missing API key, model or voice. Check Settings → Providers, then try again.",
    "queue-full": `A schedule's topic queue holds at most ${String(queueMax)} topics. Remove some under Schedules → Edit, then try again.`,
    "topic-not-found":
      "This topic was already approved, turned down or used. Reload the page to see the topics waiting now.",
    busy: "Slopify is already generating topics for this schedule. Wait for it to finish, then try again.",
    "invalid-topics":
      "Some topics name keywords this template does not use. Check each topic under Schedules → Edit and save again.",
  };
  return problem(c, {
    status,
    title: titleOf(status),
    detail: result.message ?? detail[result.reason],
    extensions: { reason: result.reason },
  });
}

export function scheduleRoutes(deps: ScheduleDeps | undefined): ReturnType<typeof routes> {
  return routes(deps);
}

function routes(deps: ScheduleDeps | undefined) {
  const service = (): ScheduleDeps => {
    if (deps === undefined) throw new HTTPException(404);
    return deps;
  };
  return (
    new Hono()
      .get("/", (c) =>
        c.json({
          schedules: listSchedules(service()).map((schedule) =>
            scheduleSummarySchema.parse(schedule),
          ),
        }),
      )
      .post("/", zValidator("json", scheduleCreateSchema, onInvalid), (c) => {
        const result = createSchedule(service(), c.req.valid("json"));
        return result.ok
          ? c.json(scheduleSummarySchema.parse(result.value), 201)
          : refused(c, result);
      })
      .get("/:id", zValidator("param", id, onInvalid), (c) => {
        const input = c.req.valid("param");
        const schedule = listSchedules(service()).find((item) => item.id === input.id);
        if (!schedule) return refused(c, { ok: false, reason: "not-found" });
        const runs = listScheduleRuns(service(), input.id);
        return runs.ok
          ? c.json({
              schedule: scheduleSummarySchema.parse(schedule),
              runs: runs.value.map((run) => scheduleRunSchema.parse(run)),
            })
          : refused(c, runs);
      })
      .put(
        "/:id",
        zValidator("param", id, onInvalid),
        zValidator("json", scheduleUpdateSchema.unwrap().omit({ id: true }), onInvalid),
        (c) => {
          const result = updateSchedule(service(), {
            ...c.req.valid("json"),
            id: c.req.valid("param").id,
          });
          return result.ok ? c.json(scheduleSummarySchema.parse(result.value)) : refused(c, result);
        },
      )
      .post(
        "/:id/pause",
        zValidator("param", id, onInvalid),
        zValidator(
          "json",
          z.object({ baseVersion: z.number().int().positive() }).strict(),
          onInvalid,
        ),
        (c) => {
          const result = pauseSchedule(service(), {
            ...c.req.valid("json"),
            id: c.req.valid("param").id,
          });
          return result.ok ? c.json(scheduleSummarySchema.parse(result.value)) : refused(c, result);
        },
      )
      .post(
        "/:id/resume",
        zValidator("param", id, onInvalid),
        zValidator(
          "json",
          z.object({ baseVersion: z.number().int().positive() }).strict(),
          onInvalid,
        ),
        (c) => {
          const result = resumeSchedule(service(), {
            ...c.req.valid("json"),
            id: c.req.valid("param").id,
          });
          return result.ok ? c.json(scheduleSummarySchema.parse(result.value)) : refused(c, result);
        },
      )
      .post(
        "/:id/cancel",
        zValidator("param", id, onInvalid),
        zValidator(
          "json",
          z.object({ baseVersion: z.number().int().positive() }).strict(),
          onInvalid,
        ),
        (c) => {
          const result = cancelSchedule(service(), {
            ...c.req.valid("json"),
            id: c.req.valid("param").id,
          });
          return result.ok ? c.json(scheduleSummarySchema.parse(result.value)) : refused(c, result);
        },
      )
      .delete(
        "/:id",
        zValidator("param", id, onInvalid),
        zValidator(
          "json",
          z.object({ baseVersion: z.number().int().positive() }).strict(),
          onInvalid,
        ),
        (c) => {
          const result = deleteSchedule(service(), {
            ...c.req.valid("json"),
            id: c.req.valid("param").id,
          });
          return result.ok ? c.json(result.value) : refused(c, result);
        },
      )
      .get("/:id/topics/held", zValidator("param", id, onInvalid), (c) => {
        const scheduleId = c.req.valid("param").id;
        if (listSchedules(service()).every((item) => item.id !== scheduleId))
          return refused(c, { ok: false, reason: "not-found" });
        return c.json({
          topics: heldTopics(service(), scheduleId).map((topic) => heldTopicSchema.parse(topic)),
        });
      })
      // Starts a generation in the background; the schedule's `topics` says when it is done.
      .post("/:id/topics/generate", zValidator("param", id, onInvalid), (c) => {
        const deps = service();
        const scheduleId = c.req.valid("param").id;
        const schedule = listSchedules(deps).find((item) => item.id === scheduleId);
        if (schedule === undefined || schedule.deletedAt !== null)
          return refused(c, { ok: false, reason: "not-found" });
        const refusal =
          schedule.topicGeneration.mode === "off"
            ? "Topic generation is off for this schedule. Turn it on under Edit → Topic generation, then save."
            : schedule.status === "canceled" || schedule.status === "completed"
              ? `This schedule is ${schedule.status}, so it needs no more topics.`
              : schedule.topics.generatingSince !== null
                ? "Slopify is already generating topics for this schedule. They appear here when it finishes."
                : deps.requestTopics === undefined
                  ? "Topic generation is not available in this Slopify. Restart Slopify and try again."
                  : undefined;
        if (refusal !== undefined)
          return problem(c, {
            status: 409,
            title: titleOf(409),
            detail: refusal,
            extensions: { reason: "busy" },
          });
        deps.requestTopics?.(scheduleId);
        return c.json({ started: true }, 202);
      })
      .post("/:id/topics/held/approve-all", zValidator("param", id, onInvalid), (c) => {
        const result = approveHeldTopics(service(), c.req.valid("param").id, "all");
        return result.ok ? c.json(scheduleSummarySchema.parse(result.value)) : refused(c, result);
      })
      .post(
        "/:id/topics/held/:topicId/approve",
        zValidator("param", topicParam, onInvalid),
        zValidator("json", z.object({ title: z.string().optional() }).strict(), onInvalid),
        (c) => {
          const { id: scheduleId, topicId } = c.req.valid("param");
          const { title } = c.req.valid("json");
          const result = approveHeldTopics(
            service(),
            scheduleId,
            [topicId],
            title === undefined ? {} : { [topicId]: title },
          );
          return result.ok ? c.json(scheduleSummarySchema.parse(result.value)) : refused(c, result);
        },
      )
      .post("/:id/topics/held/:topicId/reject", zValidator("param", topicParam, onInvalid), (c) => {
        const { id: scheduleId, topicId } = c.req.valid("param");
        const result = rejectHeldTopic(service(), scheduleId, topicId);
        return result.ok ? c.json(scheduleSummarySchema.parse(result.value)) : refused(c, result);
      })
      .put(
        "/:id/topics/held/:topicId",
        zValidator("param", topicParam, onInvalid),
        zValidator("json", heldTopicEditSchema, onInvalid),
        (c) => {
          const { id: scheduleId, topicId } = c.req.valid("param");
          const result = editHeldTopic(service(), scheduleId, topicId, c.req.valid("json"));
          return result.ok ? c.json(heldTopicSchema.parse(result.value)) : refused(c, result);
        },
      )
      .post(
        "/:id/topics/move",
        zValidator("param", id, onInvalid),
        zValidator("json", topicMoveSchema, onInvalid),
        (c) => {
          const result = moveTopic(service(), c.req.valid("param").id, c.req.valid("json"));
          return result.ok ? c.json(scheduleSummarySchema.parse(result.value)) : refused(c, result);
        },
      )
      .post(
        "/:id/topics/transfer",
        zValidator("param", id, onInvalid),
        zValidator("json", topicTransferSchema, onInvalid),
        (c) => {
          const result = transferTopic(service(), c.req.valid("param").id, c.req.valid("json"));
          return result.ok
            ? c.json({
                source: scheduleSummarySchema.parse(result.value.source),
                target: scheduleSummarySchema.parse(result.value.target),
              })
            : refused(c, result);
        },
      )
  );
}

const calendarQuery = z
  .object({ from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }) })
  .partial();

// The coming weeks on one screen. Without `from`/`to`: now to four weeks from now.
export function calendarRoutes(deps: ScheduleDeps | undefined) {
  return new Hono().get("/", zValidator("query", calendarQuery, onInvalid), (c) => {
    if (deps === undefined) throw new HTTPException(404);
    const query = c.req.valid("query");
    const from = query.from === undefined ? deps.clock.now() : new Date(query.from);
    const to =
      query.to === undefined
        ? new Date(from.valueOf() + 28 * 24 * 60 * 60_000)
        : new Date(query.to);
    const result = calendarRange(deps, from, to);
    if (!result.ok)
      return problem(c, {
        status: 400,
        title: titleOf(400),
        detail: `Choose a range whose end is after its start and at most ${String(calendarMaxDays)} days long.`,
        extensions: { reason: result.reason },
      });
    return c.json(calendarSchema.parse(result.value));
  });
}

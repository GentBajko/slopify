import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { ScheduleDeps, ScheduleResult } from "../../slices/schedules/model.js";
import {
  scheduleCreateSchema,
  scheduleRunSchema,
  scheduleSummarySchema,
  scheduleUpdateSchema,
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
import { onInvalid, problem, titleOf } from "./problem.js";

const id = z.object({ id: z.uuid() });
function refused(c: Context, result: Extract<ScheduleResult<never>, { ok: false }>): Response {
  const status = ["not-found", "missing-template"].includes(result.reason)
    ? 404
    : ["conflict", "spend-limit", "unsupported-media"].includes(result.reason)
      ? 409
      : 400;
  const detail: Record<string, string> = {
    "invalid-input": "Check the schedule fields and try again.",
    "not-found": "The schedule was not found.",
    conflict: "The schedule changed elsewhere. Reload it before trying again.",
    "missing-template": "The selected template version is no longer available.",
    "unsupported-media": "This template contains provided media and cannot run unattended.",
    "not-due": "Choose a future one-off time.",
    "spend-limit": "The estimate exceeds the schedule spend limit or contains unknown pricing.",
    readiness: "Provider or local readiness checks refused this scheduled run.",
  };
  return problem(c, {
    status,
    title: titleOf(status),
    detail: detail[result.reason],
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
  return new Hono()
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
    );
}

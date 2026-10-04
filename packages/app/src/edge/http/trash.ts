import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { withProjectControl } from "../../slices/control/lock.js";
import {
  type Restored,
  type TrashDeps,
  type TrashKind,
  type TrashRefusal,
  trashKinds,
} from "../../slices/trash/model.js";
import { deleteNow, listTrash, restoreItem } from "../../slices/trash/service.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const itemParam = z.object({
  kind: z.enum(trashKinds),
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

// Settings → Trash's Restore selected / Restore all and Delete selected / Empty trash: the
// items named, each done on its own so one refusal leaves the rest done.
const manySchema = z.object({ items: z.array(itemParam).min(1).max(5000) });

// A template comes back before the schedules that run it, so restoring both at once works.
const restoreOrder: Readonly<Record<TrashKind, number>> = {
  template: 0,
  prompt: 1,
  entry: 1,
  project: 1,
  schedule: 2,
};

interface Failed {
  readonly kind: TrashKind;
  readonly id: string;
  readonly reason: TrashRefusal;
  readonly detail: string;
}

const status: Readonly<Record<TrashRefusal, 404 | 409 | 500>> = {
  "not-found": 404,
  running: 409,
  files: 500,
  "template-in-trash": 409,
  "template-gone": 409,
};

const details: Readonly<Record<TrashRefusal, string>> = {
  "not-found":
    "This item is no longer in the trash: it was restored or removed for good. Reload Settings → Trash to see what is left.",
  running:
    "This project is still running. Use Cancel run on the project page first, then try again.",
  files:
    "Some of this project's files could not be removed. Close any program using files in the project folder, then press Delete now again.",
  "template-in-trash":
    "This schedule's template is in the trash too. Restore the template first (it is listed here), then restore the schedule.",
  "template-gone":
    "This schedule's template was removed for good, so the schedule has nothing to run. It cannot be restored; Delete now removes it from the trash.",
};

function failedItem(kind: TrashKind, id: string, reason: TrashRefusal, detail?: string): Failed {
  return {
    kind,
    id,
    reason,
    detail: detail === undefined ? details[reason] : `${details[reason]} (${detail})`,
  };
}

function refused(c: Context, reason: TrashRefusal, detail?: string): Response {
  return problem(c, {
    status: status[reason],
    title: titleOf(status[reason]),
    detail: detail === undefined ? details[reason] : `${details[reason]} (${detail})`,
    extensions: { reason },
  });
}

// Settings → Trash: the list, Restore and Delete now, one item or many. The daily purge runs from main.ts.
export function trashRoutes(deps: AppDeps) {
  const trash: TrashDeps = {
    db: deps.db,
    paths: deps.paths,
    clock: deps.clock,
    log: deps.log,
    hasInflight: deps.runner.hasInflight,
  };
  return new Hono()
    .get("/", (c) => c.json({ items: listTrash(trash) }))
    .post("/bulk/restore", zValidator("json", manySchema, onInvalid), (c) => {
      const items = [...c.req.valid("json").items].sort(
        (a, b) => restoreOrder[a.kind] - restoreOrder[b.kind],
      );
      const restored: Restored[] = [];
      const failed: Failed[] = [];
      for (const { kind, id } of items) {
        const result = restoreItem(trash, kind, id);
        if (!result.ok) {
          failed.push(failedItem(kind, id, result.reason));
          continue;
        }
        restored.push(result.value);
        if (kind === "project") deps.runner.tick(id);
      }
      return c.json({ restored, failed });
    })
    .post("/bulk/delete", zValidator("json", manySchema, onInvalid), async (c) => {
      const deleted: { kind: TrashKind; id: string }[] = [];
      const failed: Failed[] = [];
      for (const { kind, id } of c.req.valid("json").items) {
        const result =
          kind === "project"
            ? await withProjectControl(deps.db, id, () => deleteNow(trash, kind, id))
            : deleteNow(trash, kind, id);
        if (result.ok) deleted.push({ kind, id });
        else failed.push(failedItem(kind, id, result.reason, result.detail));
      }
      return c.json({ deleted, failed });
    })
    .post("/:kind/:id/restore", zValidator("param", itemParam, onInvalid), (c) => {
      const { kind, id } = c.req.valid("param");
      const result = restoreItem(trash, kind, id);
      if (!result.ok) return refused(c, result.reason);
      // A restored project picks up where it was: unfinished work goes on, a queued batch
      // item is back in its place.
      if (kind === "project") deps.runner.tick(id);
      return c.json({ restored: result.value });
    })
    .delete("/:kind/:id", zValidator("param", itemParam, onInvalid), async (c) => {
      const { kind, id } = c.req.valid("param");
      const result =
        kind === "project"
          ? await withProjectControl(deps.db, id, () => deleteNow(trash, kind, id))
          : deleteNow(trash, kind, id);
      if (!result.ok) return refused(c, result.reason, result.detail);
      return c.body(null, 204);
    });
}

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { backupConfigInputSchema } from "../../slices/backups/model.js";
import type { BackupService } from "../../slices/backups/service.js";
import { onInvalid, problem, titleOf } from "./problem.js";

// Settings → Backups: the schedule, the folder, the last result and Back up now. Writing an
// archive takes minutes, so Back up now answers at once and the screen polls this view.
export function backupRoutes(service: BackupService | undefined) {
  const backups = (): BackupService => {
    if (service === undefined) throw new HTTPException(404);
    return service;
  };
  return new Hono()
    .get("/", async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(await backups().view());
    })
    .put("/", zValidator("json", backupConfigInputSchema, onInvalid), async (c) => {
      const saved = backups().save(c.req.valid("json"));
      if (!saved.ok)
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: saved.detail,
          extensions: { field: "folder" },
        });
      return c.json(await backups().view());
    })
    .post("/run", async (c) => {
      const started = backups().runNow();
      if (!started.ok)
        return problem(c, {
          status: started.status,
          title: titleOf(started.status),
          detail: started.detail,
        });
      return c.json(await backups().view(), 202);
    });
}

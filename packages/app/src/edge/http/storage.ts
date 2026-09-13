import { Hono } from "hono";
import { exportPortable, importPortable, storageUsage } from "../../slices/storage/portable.js";
import { reconcileStorage } from "../../slices/storage/reconcile.js";
import type { AppDeps } from "./app.js";
import { problem, titleOf } from "./problem.js";

export function storageRoutes(deps: AppDeps) {
  return new Hono()
    .get("/", (c) => c.json(storageUsage({ db: deps.db, paths: deps.paths })))
    .get("/export", (c) => {
      try {
        const bytes = exportPortable({
          db: deps.db,
          paths: deps.paths,
          ids: deps.ids,
          now: () => deps.clock.now().toISOString(),
        });
        return c.body(bytes, 200, {
          "content-type": "application/zip",
          "content-length": String(bytes.byteLength),
          "content-disposition": 'attachment; filename="slopify-backup.zip"',
        });
      } catch {
        return problem(c, {
          status: 500,
          title: titleOf(500),
          detail: "The backup could not be created.",
        });
      }
    })
    .put("/import", async (c) => {
      const contentType = c.req.header("content-type") ?? "";
      if (!contentType.includes("application/zip"))
        return problem(c, {
          status: 415,
          title: titleOf(415),
          detail: "Upload a Slopify backup ZIP.",
        });
      const bytes = new Uint8Array(await c.req.raw.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > 100 * 1024 * 1024)
        return problem(c, {
          status: 413,
          title: titleOf(413),
          detail: "The backup must be between 1 byte and 100 MB.",
        });
      try {
        const imported = importPortable(
          {
            db: deps.db,
            paths: deps.paths,
            ids: deps.ids,
            now: () => deps.clock.now().toISOString(),
          },
          bytes,
        );
        return c.json(imported);
      } catch {
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: "The backup is invalid or incomplete.",
        });
      }
    })
    .post("/cleanup", (c) => c.json(reconcileStorage(deps.db, deps.paths)));
}

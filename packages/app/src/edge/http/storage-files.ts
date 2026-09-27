import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { FilesService } from "../../slices/storage/files-location.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

// Settings → Backup & storage → Your files: where projects and backups are, Open folder, and
// moving them. A move copies and checks every file, so it answers at once and the screen polls.
export function filesRoutes(deps: Pick<AppDeps, "files" | "log">) {
  const files = (): FilesService => {
    if (deps.files === undefined) throw new HTTPException(404);
    return deps.files;
  };
  return new Hono()
    .get("/", async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(await files().view());
    })
    .post(
      "/move",
      zValidator("json", z.object({ target: z.string().min(1).max(4096) }).strict(), onInvalid),
      async (c) => {
        const started = await files().move(c.req.valid("json").target);
        if (!started.ok)
          return problem(c, {
            status: started.status,
            title: titleOf(started.status),
            detail: started.detail,
            extensions: { field: "target" },
          });
        return c.json(await files().view(), 202);
      },
    )
    .post("/open", async (c) => {
      const origin = c.req.header("origin");
      if (origin !== undefined && origin !== new URL(c.req.url).origin)
        return problem(c, {
          status: 403,
          title: titleOf(403),
          detail:
            "For your safety, folders can only be opened from the Slopify page itself. Open Slopify and try again there.",
        });
      try {
        return c.json(await files().open());
      } catch (error) {
        deps.log.write("warn", "storage.open-files", { detail: String(error) });
        return problem(c, {
          status: 503,
          title: titleOf(503),
          detail:
            "Slopify could not open a file manager window on the computer it runs on. Make sure you are signed in to that computer's desktop, or open the folder shown in Settings → Backup & storage yourself.",
        });
      }
    });
}

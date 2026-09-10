import { dirname } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { assetOf, findDownload } from "../../slices/storage/downloads.js";
import { outputsOf } from "../../slices/storage/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

export function openFolderRoutes(deps: AppDeps) {
  return new Hono().post(
    "/:id/open-folder",
    zValidator(
      "param",
      z.object({
        id: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[0-9A-Za-z_-]+$/),
      }),
      onInvalid,
    ),
    zValidator(
      "json",
      z.object({
        asset: z
          .string()
          .max(64)
          .regex(/^(?:[a-z0-9-]+|images\.zip)$/),
      }),
      onInvalid,
    ),
    async (c) => {
      const origin = c.req.header("origin");
      if (origin !== undefined && origin !== new URL(c.req.url).origin) {
        return problem(c, {
          status: 403,
          title: titleOf(403),
          detail: "Open folders from Slopify itself.",
        });
      }
      const { id } = c.req.valid("param");
      const { asset } = c.req.valid("json");
      // The archive is virtual; open the first existing image's folder without building a zip.
      const assets =
        asset === "images.zip"
          ? outputsOf(deps.db, id)
              .filter((output) => output.role === "image" || output.role === "thumbnail")
              .map(assetOf)
          : [asset];
      const download = assets
        .map((name) => findDownload(deps, id, name))
        .find((result) => result.ok);
      if (download === undefined || !download.ok) {
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "No saved file was found for this output. Re-run the stage if the file was removed.",
        });
      }
      try {
        if (deps.openFolder === undefined) throw new Error("No folder opener configured");
        await deps.openFolder(dirname(download.download.path));
        return c.json({ opened: true });
      } catch {
        return problem(c, {
          status: 503,
          title: titleOf(503),
          detail:
            "Could not open the file manager on the machine running Slopify. Make sure a desktop session is available.",
        });
      }
    },
  );
}

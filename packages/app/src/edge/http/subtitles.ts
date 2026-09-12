import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

export function subtitleRoutes(_deps: AppDeps) {
  return new Hono().patch(
    "/:id/subtitles",
    zValidator("param", idParam, onInvalid),
    revisionRequired,
  );
}
function revisionRequired(c: Context): Response {
  return problem(c, {
    status: 409,
    title: titleOf(409),
    detail: "Open Edit project to save changes, then review the affected rebuild.",
    extensions: { reason: "revision-required" },
  });
}

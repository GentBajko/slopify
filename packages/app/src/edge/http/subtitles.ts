import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { AppDeps } from "./app.js";
import { idParam } from "./ids.js";
import { onInvalid } from "./problem.js";
import { revisionRequired } from "./refusal.js";

export function subtitleRoutes(_deps: AppDeps) {
  return new Hono().patch(
    "/:id/subtitles",
    zValidator("param", idParam, onInvalid),
    revisionRequired,
  );
}

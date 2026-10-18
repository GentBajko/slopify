import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { providerStatuses } from "../../slices/settings/readiness.js";
import type { StudioResult } from "../../slices/template-studio/model.js";
import { getStudio, type StudioDeps } from "../../slices/template-studio/service.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

// Library → Templates → Open studio. Not `/api/studio`, which is the YouTube Studio pack.
const param = z.object({ id: z.uuid() });

export function refusedStudio(
  c: Context,
  result: Extract<StudioResult<never>, { ok: false }>,
): Response {
  const status =
    result.reason === "not-found" ? 404 : result.reason === "invalid-input" ? 400 : 409;
  return problem(c, {
    status,
    title: titleOf(status),
    detail: result.message,
    extensions: { reason: result.reason },
  });
}

export function studioDeps(
  deps: Pick<AppDeps, "db" | "clock" | "probe" | "hostCliStatus" | "speechHost">,
): StudioDeps {
  return {
    db: deps.db,
    clock: deps.clock,
    providerStatuses: () =>
      providerStatuses({
        db: deps.db,
        probe: deps.probe,
        hostCliStatus: deps.hostCliStatus,
        host: deps.speechHost,
      }),
  };
}

export function templateStudioRoutes(deps: AppDeps) {
  const studio = studioDeps(deps);
  return new Hono().get("/:id", zValidator("param", param, onInvalid), async (c) => {
    const result = await getStudio(studio, c.req.valid("param").id);
    return result.ok ? c.json(result.value) : refusedStudio(c, result);
  });
}

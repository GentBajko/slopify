import { Hono } from "hono";
import type { UpdateInfo } from "../../updater/model.js";
import type { AppDeps } from "./app.js";
import { problem, titleOf } from "./problem.js";

export function updateRoutes(deps: AppDeps) {
  const unavailable: UpdateInfo = {
    currentVersion: deps.version,
    latestVersion: null,
    available: false,
    busy: false,
    canUpdate: false,
    status: "idle",
    blockedReason: "In-app updates are unavailable for this server.",
  };
  return new Hono()
    .get("/ready", (c) => {
      c.header("Cache-Control", "no-store");
      if (!deps.updater?.ready(c.req.header("X-Slopify-Update-Token") ?? ""))
        return problem(c, { status: 403, title: titleOf(403) });
      return c.json({ status: "ok", version: deps.version });
    })
    .post("/activate", async (c) => {
      c.header("Cache-Control", "no-store");
      const token = c.req.header("X-Slopify-Update-Token") ?? "";
      if (!deps.updater?.ready(token)) return problem(c, { status: 403, title: titleOf(403) });
      if (!(await deps.updater.activate(token)))
        return problem(c, { status: 409, title: titleOf(409) });
      return c.json({ status: "ok", version: deps.version });
    })
    .get("/", async (c) => {
      c.header("Cache-Control", "no-store");
      return c.json(
        deps.updater === undefined
          ? unavailable
          : await deps.updater.check(c.req.query("refresh") === "1"),
      );
    })
    .post("/", async (c) => {
      const origin = c.req.header("Origin");
      if (origin !== undefined && origin !== new URL(c.req.url).origin)
        return problem(c, {
          status: 403,
          title: titleOf(403),
          detail: "Start updates from the Slopify page on this server.",
        });
      if (deps.updater === undefined)
        return problem(c, { status: 409, title: titleOf(409), detail: unavailable.blockedReason });
      const result = await deps.updater.start();
      if (result.ok) return c.json(result.info, 202);
      const status = result.code ?? 409;
      return problem(c, {
        status,
        title: titleOf(status),
        detail:
          result.info.blockedReason ??
          result.info.error ??
          "No newer published update is available.",
      });
    });
}

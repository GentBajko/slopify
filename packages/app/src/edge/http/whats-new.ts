import { Hono } from "hono";
import { dismissWhatsNew, readWhatsNew } from "../../slices/settings/whats-new.js";
import type { AppDeps } from "./app.js";

// Preserve Hono's inferred route types for the web client.
export function whatsNewRoutes(deps: Pick<AppDeps, "db" | "version">) {
  return new Hono()
    .get("/", (c) => c.json(readWhatsNew(deps.db, deps.version)))
    .post("/seen", (c) => c.json(dismissWhatsNew(deps.db, deps.version)));
}

import { Hono } from "hono";
import { providerStatuses } from "../../slices/settings/readiness.js";
import type { AppDeps } from "./app.js";

/**
 * A deliberately boring, secret-free support bundle. It is JSON rather than a
 * filesystem archive so it can be copied from a remote/local browser and is
 * still useful when a project output is unavailable.
 */
export function diagnosticsRoutes(deps: AppDeps) {
  return new Hono().get("/", async (c) => {
    const providers = await providerStatuses({
      db: deps.db,
      probe: deps.probe,
      hostCliStatus: deps.hostCliStatus,
    });
    const projectCount = deps.db.prepare("SELECT count(*) AS count FROM projects").get();
    const schema = deps.db.prepare("SELECT max(version) AS version FROM schema_migrations").get();
    c.header("Cache-Control", "no-store");
    c.header("Content-Disposition", 'attachment; filename="slopify-diagnostics.json"');
    return c.json({
      appVersion: deps.version,
      schemaVersion: typeof schema?.version === "number" ? schema.version : null,
      platform: process.platform,
      nodeMajor: Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10),
      providers: providers.map((provider) => ({
        id: provider.id,
        family: provider.family,
        displayName: provider.displayName,
        readiness: provider.readiness,
        ...(provider.cliPath === undefined ? {} : { cliPath: provider.cliPath }),
      })),
      projects: { total: typeof projectCount?.count === "number" ? projectCount.count : 0 },
      catalogue: deps.catalogue?.status() ?? {
        warning:
          "The model list (models.yaml) is not loaded yet. Wait a moment and reload the page; if it stays like this, restart Slopify.",
      },
    });
  });
}

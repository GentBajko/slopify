import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { RemoteAccessService } from "../remote-access/service.js";
import { actorOf } from "./actor.js";
import { onInvalid, problem } from "./problem.js";
import { viaProxy } from "./same-page.js";

const body = z.object({
  enabled: z.boolean(),
  httpsPort: z.number().int().min(1).max(65535).optional(),
});

// Settings → Remote access: Slopify's page on the person's other devices through
// Tailscale serve. Reading it is open to agents (get_remote_access); turning it on or off is
// the person's alone, from this computer.
export function remoteAccessRoutes(service: RemoteAccessService | undefined) {
  const unavailable =
    "Remote access can't be set from this Slopify. Start it with npx @gentbajko/slopify and try Settings → Remote access again.";
  return new Hono()
    .get("/", async (c) => {
      if (service === undefined) return problem(c, { status: 404, detail: unavailable });
      c.header("Cache-Control", "no-store");
      const view = await service.view();
      return c.json(viaProxy(c.req.raw.headers) ? { ...view, changeable: false } : view);
    })
    .put("/", zValidator("json", body, onInvalid), async (c) => {
      if (service === undefined) return problem(c, { status: 404, detail: unavailable });
      if (actorOf(c) !== "person")
        return problem(c, {
          status: 403,
          detail:
            "Remote access is the person's to turn on or off, in Settings → Remote access. Agents and the assistant can only read it (get_remote_access).",
        });
      if (viaProxy(c.req.raw.headers))
        return problem(c, {
          status: 403,
          detail:
            "Remote access is turned on or off only on the computer Slopify runs on. Open Settings → Remote access there, at http://127.0.0.1 and Slopify's port.",
        });
      const { enabled, httpsPort } = c.req.valid("json");
      return c.json(await service.set(enabled, httpsPort));
    });
}

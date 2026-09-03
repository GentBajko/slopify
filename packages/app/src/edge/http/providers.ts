import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import type { KeysDeps } from "../../slices/settings/keys.js";
import { keyStatus, removeProviderKey, saveProviderKey } from "../../slices/settings/keys.js";
import type { ProviderId } from "../../slices/settings/model.js";
import { providerById, providerIds } from "../../slices/settings/model.js";
import type { ReadinessDeps } from "../../slices/settings/readiness.js";
import { providerStatuses } from "../../slices/settings/readiness.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const providerParam = z.object({ id: z.enum(providerIds) });
// ceiling: no format check is allowed on a key, so the only thing said about the value is
// that it is a string of a length a key could plausibly have. Raise the bound if a provider
// ever issues something longer.
const keyBody = z.object({ key: z.string().min(1).max(4096) });

// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function providerRoutes(deps: AppDeps) {
  const keys: KeysDeps = { db: deps.db, clock: deps.clock };
  const readiness: ReadinessDeps = { db: deps.db, probe: deps.probe };

  return (
    new Hono()
      // What Settings draws its rails from and Play its dropdowns: every provider, with
      // the one fact that decides whether it is selectable.
      .get("/", async (c) => c.json({ providers: await providerStatuses(readiness) }))
      .put(
        "/:id/key",
        zValidator("param", providerParam, onInvalid),
        zValidator("json", keyBody, onInvalid),
        (c) => {
          const { id } = c.req.valid("param");
          const result = saveProviderKey(keys, id, c.req.valid("json").key);
          if (!result.ok) {
            return refusal(c, id, result.reason);
          }
          // The response says a key is stored and shows the mask, never the value.
          return c.json(keyStatus(keys, id));
        },
      )
      .delete("/:id/key", zValidator("param", providerParam, onInvalid), (c) => {
        const { id } = c.req.valid("param");
        const result = removeProviderKey(keys, id);
        if (!result.ok) {
          return refusal(c, id, result.reason);
        }
        return c.body(null, 204);
      })
  );
}

function refusal(
  c: Context,
  id: ProviderId,
  reason: "blank" | "cli-provider" | "absent",
): Response {
  const name = providerById(id).displayName;
  if (reason === "cli-provider") {
    return problem(c, {
      status: 400,
      title: titleOf(400),
      detail: `${name} signs in through its own CLI, so there is no key to store here.`,
    });
  }
  if (reason === "absent") {
    return problem(c, {
      status: 404,
      title: titleOf(404),
      detail: `No key is stored for ${name}.`,
    });
  }
  return problem(c, {
    status: 400,
    title: titleOf(400),
    detail: "This key cannot be saved; the listed fields need attention.",
    extensions: { fields: [{ field: "key", message: "An API key is required." }] },
  });
}

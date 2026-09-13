import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createHub } from "../../src/edge/events/hub.js";
import { createApp } from "../../src/edge/http/app.js";
import type { Registry } from "../../src/kernel/ports/registry.js";
import { checkpointRowSchema } from "../../src/slices/checkpoints/schema.js";
import { composedFixture, current, start } from "../revision-rebuild.fake.js";

export async function checkpointFixture(ports: Partial<Registry> = {}) {
  const h = await composedFixture(ports);
  const app = createApp({
    ...h.deps,
    hub: createHub(h.deps),
    version: "test",
    webDist: "/missing",
    probe: async () => ({ ran: false, stdout: "" }),
    flushSoon: () => undefined,
  });
  const send = (path: string, method = "GET", body?: unknown) =>
    app.request(`/api/projects/${h.projectId}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  return {
    ...h,
    app,
    send,
    admit: (keys: readonly string[] = ["image:one", "image:two"]) =>
      start({ ...h.deps, runner: { ...h.runner, tick: () => undefined } }, h.projectId, keys),
    status: async () => {
      const response = await send("/checkpoints");
      if (!response.ok) throw new Error(await response.text());
      return z
        .object({
          revisionId: z.string(),
          checkpoints: z.array(checkpointRowSchema.unwrap().passthrough()),
        })
        .parse(await response.json());
    },
    change: (stages: readonly string[]) =>
      send("/checkpoints", "PATCH", {
        revisionId: current(h.deps, h.projectId).revision.id,
        stages,
      }),
    approve: (
      gate: { checkpointId: string; revisionId: string; fingerprint: string },
      key = randomUUID(),
    ) =>
      send(`/checkpoints/${gate.checkpointId}/approve`, "POST", {
        revisionId: gate.revisionId,
        fingerprint: gate.fingerprint,
        idempotencyKey: key,
      }),
    dispose: async () => {
      await h.runner.abortAll();
      await h.runner.settled();
      h.audioPreviews.close();
      h.close();
    },
  };
}

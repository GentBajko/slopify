import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { z } from "zod";
import { checkRevisionControl } from "../control/revision-control.js";
import { checkMutation, requestHash } from "../revisions/mutation-request.js";
import { admissionReceipt } from "./admission-repo.js";
import { readRecovery, rememberRecovery, reserveRecovery } from "./recovery-repo.js";
import { serviceFixture } from "./service.fake.js";

it.each([false, true])(
  "owns one UUID across every control namespace (upgrade=%s)",
  async (upgrade) => {
    const h = await serviceFixture(upgrade);
    try {
      const input = {
        baseRevisionId: h.base.revision.id,
        idempotencyKey: randomUUID(),
        action: { kind: "resume" as const },
      };
      reserveRecovery(h.deps, h.projectId, input, null);
      expect(
        readRecovery(h.deps, h.projectId, {
          ...input,
          action: { kind: "retry", stage: "images" },
        }),
      ).toMatchObject({ ok: false, reason: "idempotency-conflict" });
      expect(
        admissionReceipt(h.deps.db, h.projectId, input.idempotencyKey, "different"),
      ).toMatchObject({ ok: false, reason: "conflict" });
      for (const operation of ["save", "restore"] as const)
        expect(
          checkMutation(h.deps, {
            projectId: h.projectId,
            ...input,
            operation,
            hash: requestHash(operation, input.baseRevisionId, {}),
          }),
        ).toMatchObject({ ok: false, reason: "idempotency-conflict" });
      for (const operation of ["pause", "cancel"] as const)
        expect(
          checkRevisionControl(
            h.deps,
            h.projectId,
            operation,
            { baseRevisionId: input.baseRevisionId, idempotencyKey: input.idempotencyKey },
            z.object({ ok: z.literal(true) }),
          ),
        ).toMatchObject({ ok: false, reason: "idempotency-conflict" });
      const result = {
        ok: false as const,
        reason: "readiness" as const,
        intentRevisionId: h.base.revision.id,
        fields: [{ field: "image", message: "Configure the provider." }],
      };
      rememberRecovery(h.deps, h.projectId, input, result);
      expect(readRecovery(h.deps, h.projectId, input)).toEqual(result);
      expect(h.ticks).toEqual([]);
    } finally {
      h.close();
    }
  },
);

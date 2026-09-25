import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { z } from "zod";
import { checkRevisionControl } from "../control/revision-control.js";
import { checkMutation, requestHash } from "../revisions/mutation-request.js";
import { saveRevision } from "../revisions/mutations.js";
import { admissionReceipt } from "./admission-repo.js";
import { retainedPreviewPlan } from "./preview-retained.js";
import { recoverProject } from "./recovery.js";
import { readRecovery, recoveryKey, rememberRecovery, reserveRecovery } from "./recovery-repo.js";
import { regenerationEdit } from "./recovery-selection.js";
import { paidServiceFixture, serviceFixture } from "./service.fake.js";

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

it("reuses the original saved intent when a process stops before recording its revision id", async () => {
  const h = await paidServiceFixture();
  try {
    const input = {
      baseRevisionId: h.base.revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "rerun" as const, stage: "images" as const },
    };
    const edit = regenerationEdit(
      h.base,
      retainedPreviewPlan(h.deps, h.base, h.catalogue),
      "images",
    );
    if (!edit) throw new Error("Missing edit");
    reserveRecovery(h.deps, h.projectId, input, edit);
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: input.baseRevisionId,
      idempotencyKey: recoveryKey(input, "save"),
      edit,
    });
    if (!saved.ok) throw new Error("Missing saved intent");
    const count = h.deps.db.prepare("SELECT count(*) AS n FROM project_revisions").get()?.n;
    const result = await recoverProject(h.deps, h.projectId, input);
    expect(result).toMatchObject({ ok: true, value: { revisionId: saved.view.revision.id } });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_revisions").get()?.n).toBe(count);
  } finally {
    h.close();
  }
});

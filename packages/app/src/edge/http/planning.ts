import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { modelFields } from "../../catalog/validate.js";
import { runDraftSchema } from "../../slices/admission/repo.js";
import { admit } from "../../slices/admission/rules.js";
import { batchExists, enqueueBatch, pumpQueue, queueEntries } from "../../slices/batch/index.js";
import { estimateRun } from "../../slices/estimate/index.js";
import { resolveFont } from "../../slices/fonts/index.js";
import { pickTemplates, renderPicked } from "../../slices/library/slots.js";
import { stagedFiles } from "../../slices/storage/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const planningBody = z.object({
  draft: runDraftSchema,
  expectedWords: z.number().int().min(1).max(100000).default(1500),
  items: z
    .array(
      z
        .object({
          title: z.string().trim().min(1).max(200),
          values: z.record(z.string().max(200), z.string().max(10000)),
        })
        .strict(),
    )
    .min(1)
    .max(50)
    .optional(),
});
const batchBody = planningBody.extend({ requestId: z.uuid() });
export function planningRoutes(deps: AppDeps) {
  const prepare = (input: z.infer<typeof planningBody>) => {
    const drafts = input.items?.map((item) => ({
      ...input.draft,
      title: item.title,
      values: { ...input.draft.values, ...item.values },
    })) ?? [input.draft];
    return drafts.map((draft, index) => {
      const picked = pickTemplates(deps.db, draft);
      const admitted = admit({
        draft: picked.draft,
        staged: stagedFiles(deps.db),
        requiredSlots: picked.requiredSlots,
      });
      const accepted = admitted.ok ? admitted.draft : picked.draft;
      const fields = [
        ...picked.missing,
        ...(admitted.ok ? [] : admitted.fields),
        ...modelFields(accepted, deps.catalogue),
      ].map((f) => ({
        ...f,
        message: `${drafts.length > 1 ? `Video ${index + 1}: ` : ""}${f.message}`,
      }));
      return { draft: accepted, rendered: renderPicked(picked, accepted.values), fields };
    });
  };
  return new Hono()
    .get("/queue", (c) => c.json({ queue: queueEntries(deps.db) }))
    .post("/estimate", zValidator("json", planningBody, onInvalid), (c) => {
      const input = c.req.valid("json");
      const runs = prepare(input);
      const fields = runs.flatMap((r) => r.fields);
      if (fields.length)
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: "Review the run setup.",
          extensions: { fields },
        });
      return c.json({
        estimates: runs.map((r) =>
          estimateRun(r.draft, r.rendered, input.expectedWords, deps.catalogue),
        ),
      });
    })
    .post("/batch", zValidator("json", batchBody, onInvalid), async (c) => {
      const input = c.req.valid("json");
      if (batchExists(deps.db, input.requestId))
        return c.json({ queue: queueEntries(deps.db, input.requestId) });
      const subtitles = input.draft.subtitles;
      if (subtitles && subtitles.mode !== "off") {
        try {
          await resolveFont(deps.paths, subtitles.fontId);
        } catch {
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: "Choose an available subtitle font before starting.",
          });
        }
      }
      const runs = prepare(input);
      const fields = runs.flatMap((r) => r.fields);
      if (fields.length)
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: "No videos were queued. Review the listed fields.",
          extensions: { fields },
        });
      const queue = enqueueBatch(
        { ...deps, emit: (event) => deps.hub.emitGlobal(event) },
        input.requestId,
        runs,
      );
      pumpQueue(deps.db, deps.runner);
      return c.json({ queue }, 201);
    });
}

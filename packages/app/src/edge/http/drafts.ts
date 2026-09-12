import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { DraftStartDeps } from "../../slices/play-drafts/model.js";
import { draftRow } from "../../slices/play-drafts/repo.js";
import { reviewDraft } from "../../slices/play-drafts/review.js";
import {
  createDraftInputSchema,
  discardDraftInputSchema,
  draftViewSchema,
  playReviewSchema,
  playStartResultSchema,
  saveDraftInputSchema,
} from "../../slices/play-drafts/schema.js";
import {
  createDraft,
  discardDraft,
  forkDraft,
  listDrafts,
  readDraft,
  saveDraft,
} from "../../slices/play-drafts/service.js";
import { startPlayDraft } from "../../slices/play-drafts/start.js";
import { draftFileRoutes } from "./draft-files.js";
import { draftProblem } from "./draft-problem.js";
import { onInvalid } from "./problem.js";

const idParam = z.object({ id: z.uuid() });
const versionBody = discardDraftInputSchema.unwrap().omit({ id: true });
const saveBody = saveDraftInputSchema.unwrap().omit({ id: true });
const startBody = versionBody.extend({ reviewId: z.uuid() }).strict();
const summariesSchema = z
  .object({
    drafts: z.array(
      z
        .object({
          id: z.uuid(),
          title: z.string(),
          version: z.number().int().positive(),
          updatedAt: z.string(),
          readable: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

// Inference preserves the route contracts consumed by the SPA client.
export function draftRoutes(deps: DraftStartDeps | undefined) {
  const service = (): DraftStartDeps => {
    if (deps === undefined) throw new HTTPException(404);
    return deps;
  };
  return new Hono()
    .get("/", (c) => c.json(summariesSchema.parse({ drafts: listDrafts(service()) })))
    .post("/", zValidator("json", createDraftInputSchema, onInvalid), (c) => {
      const input = c.req.valid("json");
      const existing = draftRow(service().db, input.id) !== undefined;
      const result = createDraft(service(), input);
      return result.ok
        ? c.json(draftViewSchema.parse(result.value), existing ? 200 : 201)
        : draftProblem(c, result);
    })
    .get("/:id", zValidator("param", idParam, onInvalid), (c) => {
      const result = readDraft(service(), c.req.valid("param").id);
      return result.ok ? c.json(draftViewSchema.parse(result.value)) : draftProblem(c, result);
    })
    .put(
      "/:id",
      zValidator("param", idParam, onInvalid),
      zValidator("json", saveBody, onInvalid),
      (c) => {
        const result = saveDraft(service(), {
          ...c.req.valid("json"),
          id: c.req.valid("param").id,
        });
        return result.ok ? c.json(draftViewSchema.parse(result.value)) : draftProblem(c, result);
      },
    )
    .post(
      "/:id/fork",
      zValidator("param", idParam, onInvalid),
      zValidator("json", createDraftInputSchema, onInvalid),
      (c) => {
        const input = { ...c.req.valid("json"), sourceId: c.req.valid("param").id };
        const existing = draftRow(service().db, input.id) !== undefined;
        const result = forkDraft(service(), input);
        return result.ok
          ? c.json(draftViewSchema.parse(result.value), existing ? 200 : 201)
          : draftProblem(c, result);
      },
    )
    .delete(
      "/:id",
      zValidator("param", idParam, onInvalid),
      zValidator("json", versionBody, onInvalid),
      (c) => {
        const result = discardDraft(service(), {
          ...c.req.valid("json"),
          id: c.req.valid("param").id,
        });
        return result.ok
          ? c.json(
              z
                .object({ discarded: z.literal(true) })
                .strict()
                .parse(result.value),
            )
          : draftProblem(c, result);
      },
    )
    .post(
      "/:id/review",
      zValidator("param", idParam, onInvalid),
      zValidator("json", versionBody, onInvalid),
      async (c) => {
        const result = await reviewDraft(service(), {
          ...c.req.valid("json"),
          id: c.req.valid("param").id,
        });
        return result.ok ? c.json(playReviewSchema.parse(result.value)) : draftProblem(c, result);
      },
    )
    .post(
      "/:id/start",
      zValidator("param", idParam, onInvalid),
      zValidator("json", startBody, onInvalid),
      async (c) => {
        const result = await startPlayDraft(service(), {
          ...c.req.valid("json"),
          draftId: c.req.valid("param").id,
        });
        return result.ok
          ? c.json(playStartResultSchema.parse(result.value), result.value.replayed ? 200 : 201)
          : draftProblem(c, result);
      },
    )
    .route("/", draftFileRoutes(service));
}

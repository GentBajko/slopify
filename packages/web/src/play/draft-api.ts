import type {
  DraftAttachment,
  DraftSaveInput,
  DraftSummary,
  DraftView,
  PlayReview,
  PlayStartInput,
  PlayStartResult,
} from "@app/slices/play-drafts/model.js";
import {
  createDraftInputSchema,
  discardDraftInputSchema,
  draftAttachmentSchema,
  draftViewSchema,
  forkDraftInputSchema,
  playReviewSchema,
  playStartResultSchema,
  saveDraftInputSchema,
} from "@app/slices/play-drafts/schema.js";
import { z } from "zod";
import type { Api } from "@/api";
import { errorOf, understood } from "@/http";

export interface DraftRefusal {
  readonly ok: false;
  readonly reason: string;
  readonly message: string;
  readonly currentVersion: number | null;
  readonly fields: readonly { readonly field: string; readonly message: string }[];
  readonly reviewId?: string;
}
export type DraftReply<T> = { readonly ok: true; readonly value: T } | DraftRefusal;
const problemSchema = z.object({
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  reason: z.string().optional(),
  currentVersion: z.number().int().positive().nullable().optional(),
  reviewId: z.uuid().optional(),
  fields: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
const summariesSchema = z
  .object({
    drafts: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string(),
            version: z.number().int().positive(),
            updatedAt: z.string(),
            readable: z.boolean(),
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();
const startSchema = discardDraftInputSchema
  .unwrap()
  .omit({ id: true })
  .extend({ draftId: z.uuid(), reviewId: z.uuid() })
  .strict();

async function responseOf<T>(response: Response, schema: z.ZodType<T>): Promise<DraftReply<T>> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw errorOf(response, undefined);
  }
  if (response.ok) return { ok: true, value: understood(schema, raw) };
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) throw errorOf(response, undefined);
  const value = parsed.data;
  if (![400, 404, 409].includes(response.status))
    throw errorOf(response, {
      title: value.title,
      status: value.status,
      ...(value.detail === undefined ? {} : { detail: value.detail }),
      ...(value.fields === undefined ? {} : { fields: value.fields }),
    });
  return {
    ok: false,
    reason: value.reason ?? "invalid-request",
    message: value.detail ?? value.title,
    currentVersion: value.currentVersion ?? null,
    fields:
      value.fields ?? value.errors?.map((one) => ({ field: one.path, message: one.message })) ?? [],
    ...(value.reviewId === undefined ? {} : { reviewId: value.reviewId }),
  };
}
async function request<T>(
  api: Api,
  path: string,
  method: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<DraftReply<T>> {
  const response = await api.fetch(`${api.origin}/api/drafts${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  return responseOf(response, schema);
}
function draftPath(id: string): string {
  return `/${encodeURIComponent(z.uuid().parse(id))}`;
}

export async function listPlayDrafts(
  api: Api,
): Promise<DraftReply<{ readonly drafts: readonly DraftSummary[] }>> {
  return request(api, "", "GET", summariesSchema);
}
export async function createPlayDraft(
  api: Api,
  input: z.infer<typeof createDraftInputSchema>,
): Promise<DraftReply<DraftView>> {
  return request(api, "", "POST", draftViewSchema, createDraftInputSchema.parse(input));
}
export async function readPlayDraft(api: Api, id: string): Promise<DraftReply<DraftView>> {
  return request(api, draftPath(id), "GET", draftViewSchema);
}
export async function savePlayDraft(
  api: Api,
  input: DraftSaveInput,
): Promise<DraftReply<DraftView>> {
  const { id, ...body } = saveDraftInputSchema.parse(input);
  return request(api, draftPath(id), "PUT", draftViewSchema, body);
}
export async function forkPlayDraft(
  api: Api,
  input: z.infer<typeof forkDraftInputSchema>,
): Promise<DraftReply<DraftView>> {
  const { sourceId, ...body } = forkDraftInputSchema.parse(input);
  return request(api, `${draftPath(sourceId)}/fork`, "POST", draftViewSchema, body);
}
export async function discardPlayDraft(
  api: Api,
  input: z.infer<typeof discardDraftInputSchema>,
): Promise<DraftReply<{ readonly discarded: true }>> {
  const { id, ...body } = discardDraftInputSchema.parse(input);
  return request(
    api,
    draftPath(id),
    "DELETE",
    z.object({ discarded: z.literal(true) }).strict(),
    body,
  );
}
export async function reviewPlayDraft(
  api: Api,
  input: z.infer<typeof discardDraftInputSchema>,
): Promise<DraftReply<PlayReview>> {
  const { id, ...body } = discardDraftInputSchema.parse(input);
  return request(api, `${draftPath(id)}/review`, "POST", playReviewSchema, body);
}
export async function startPlayDraft(
  api: Api,
  input: PlayStartInput,
): Promise<DraftReply<PlayStartResult>> {
  const { draftId, ...body } = startSchema.parse(input);
  return request(api, `${draftPath(draftId)}/start`, "POST", playStartResultSchema, body);
}
export function draftAttachmentUrl(api: Api, draftId: string, attachmentId: string): string {
  return `${api.origin}/api/drafts${draftPath(draftId)}/attachments/${encodeURIComponent(z.uuid().parse(attachmentId))}/file`;
}
export async function uploadPlayDraftAttachment(
  api: Api,
  draftId: string,
  attachmentId: string,
  file: File,
  signal?: AbortSignal,
): Promise<DraftReply<DraftAttachment>> {
  const body = new FormData();
  body.set("file", file);
  return responseOf(
    await api.fetch(draftAttachmentUrl(api, draftId, attachmentId), {
      method: "PUT",
      body,
      ...(signal ? { signal } : {}),
    }),
    draftAttachmentSchema,
  );
}

import { type FolderReply, folderReplySchema } from "@app/edge/http/folder-location-schema.js";
import type {
  RebuildAdmission,
  RebuildPreview,
  RebuildSelection,
} from "@app/slices/rebuild/model.js";
import {
  previewRebuildSchema,
  rebuildAdmissionSchema,
  rebuildPreviewSchema,
  startRebuildSchema,
} from "@app/slices/rebuild/model.js";
import type {
  BaselineResult,
  RevisionEdit,
  RevisionMutationResult,
  RevisionSummary,
  RevisionView,
} from "@app/slices/revisions/model.js";
import {
  baselineSuccessSchema,
  restoreRevisionSchema,
  revisionMutationSuccessSchema,
  revisionSummarySchema,
  revisionViewSchema,
  saveRevisionSchema,
} from "@app/slices/revisions/schema.js";
import { z } from "zod";
import type { Api } from "@/api";
import { refusable } from "@/http";
export interface RevisionRefusal {
  readonly ok: false;
  readonly reason: string;
  readonly message: string;
  readonly currentRevisionId: string | null;
  readonly fields: readonly { readonly field: string; readonly message: string }[];
}
export type RevisionReply<T> = { readonly ok: true; readonly value: T } | RevisionRefusal;
async function responseOf<T>(response: Response, schema: z.ZodType<T>): Promise<RevisionReply<T>> {
  const result = await refusable(response, schema);
  if (result.ok) return result;
  const { refusal } = result;
  return {
    ok: false,
    reason: refusal.reason ?? "invalid-request",
    message: refusal.message,
    currentRevisionId: refusal.currentRevisionId,
    fields: refusal.fields,
  };
}
async function request<T>(
  api: Api,
  projectId: string,
  suffix: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<RevisionReply<T>> {
  const response = await api.fetch(
    `${api.origin}/api/projects/${encodeURIComponent(projectId)}${suffix}`,
    body === undefined
      ? { method: "GET" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  return responseOf(response, schema);
}
export function prepareRevision(
  api: Api,
  projectId: string,
): Promise<RevisionReply<Extract<BaselineResult, { ok: true }>>> {
  return request(api, projectId, "/revisions/prepare", baselineSuccessSchema, {});
}
export function saveProjectRevision(
  api: Api,
  projectId: string,
  input: {
    readonly baseRevisionId: string;
    readonly idempotencyKey: string;
    readonly edit: RevisionEdit;
  },
): Promise<RevisionReply<Extract<RevisionMutationResult, { ok: true }>>> {
  return request(
    api,
    projectId,
    "/revisions",
    revisionMutationSuccessSchema,
    saveRevisionSchema.parse(input),
  );
}
export function restoreProjectRevision(
  api: Api,
  projectId: string,
  input: {
    readonly baseRevisionId: string;
    readonly idempotencyKey: string;
    readonly targetRevisionId: string;
  },
): Promise<RevisionReply<Extract<RevisionMutationResult, { ok: true }>>> {
  return request(
    api,
    projectId,
    "/revisions/restore",
    revisionMutationSuccessSchema,
    restoreRevisionSchema.parse(input),
  );
}
const agentActionSchema = z.object({
  id: z.string(),
  tool: z.string(),
  title: z.string(),
  revisionId: z.string().nullable(),
  createdAt: z.string(),
  // Absent from a Slopify that kept no actor: every action then was an agent's.
  actor: z.enum(["agent", "assistant"]).default("agent"),
});
export type AgentActionView = z.infer<typeof agentActionSchema>;
export function historyOf(
  api: Api,
  projectId: string,
): Promise<
  RevisionReply<{
    readonly revisions: readonly RevisionSummary[];
    readonly agentActions: readonly AgentActionView[];
  }>
> {
  return request(
    api,
    projectId,
    "/revisions",
    z.object({
      revisions: z.array(revisionSummarySchema),
      agentActions: z.array(agentActionSchema).default([]),
    }),
  );
}
export function viewOf(
  api: Api,
  projectId: string,
  revisionId: string,
): Promise<RevisionReply<{ readonly view: RevisionView }>> {
  return request(
    api,
    projectId,
    `/revisions/${encodeURIComponent(revisionId)}`,
    z.object({ view: revisionViewSchema }),
  );
}
const chunkKeys = z.array(z.string()).readonly();
export type NarrationChunkOrder =
  | {
      readonly [segment in "intro" | "body" | "outro"]?: readonly string[] | undefined;
    }
  | null;
export function narrationChunkOrderOf(
  api: Api,
  projectId: string,
  revisionId: string,
): Promise<RevisionReply<{ readonly chunks: NarrationChunkOrder }>> {
  return request(
    api,
    projectId,
    `/revisions/${encodeURIComponent(revisionId)}/narration-chunks`,
    z.object({
      chunks: z
        .object({
          intro: chunkKeys.optional(),
          body: chunkKeys.optional(),
          outro: chunkKeys.optional(),
        })
        .nullable(),
    }),
  );
}
export function previewProjectRebuild(
  api: Api,
  projectId: string,
  input: {
    readonly baseRevisionId: string;
    readonly request: RebuildSelection;
  },
): Promise<RevisionReply<{ readonly ok: true; readonly value: RebuildPreview }>> {
  return request(
    api,
    projectId,
    "/rebuild/preview",
    z.object({ ok: z.literal(true), value: rebuildPreviewSchema }),
    previewRebuildSchema.parse(input),
  );
}
export function startProjectRebuild(
  api: Api,
  projectId: string,
  input: {
    readonly baseRevisionId: string;
    readonly idempotencyKey: string;
    readonly previewId: string;
    readonly acknowledgeUnknownCosts: boolean;
    readonly confirmedProvidedWorkKeys: readonly string[];
  },
): Promise<RevisionReply<{ readonly ok: true; readonly value: RebuildAdmission }>> {
  return request(
    api,
    projectId,
    "/rebuild",
    z.object({ ok: z.literal(true), value: rebuildAdmissionSchema }),
    startRebuildSchema.parse(input),
  );
}
export function revisionFileUrl(
  api: Api,
  projectId: string,
  revisionId: string,
  recordId: string,
): string {
  return `${api.origin}/files/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/${encodeURIComponent(recordId)}`;
}

export async function openRevisionFolder(
  api: Api,
  projectId: string,
  revisionId: string,
  recordId: string,
): Promise<FolderReply> {
  const response = await api.fetch(
    `${api.origin}/api/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/${encodeURIComponent(recordId)}/open-folder`,
    { method: "POST" },
  );
  const result = await responseOf(response, folderReplySchema);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
export function revisionImagesUrl(api: Api, projectId: string, revisionId: string): string {
  return revisionFileUrl(api, projectId, revisionId, "images.zip");
}

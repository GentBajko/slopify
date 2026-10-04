import type { AddableOutput } from "@app/slices/outputs/add.js";
import { addedOutputPreviewSchema, addedOutputSchema } from "@app/slices/outputs/model.js";
import { z } from "zod";
import type { Api } from "@/api";
import { fileUrl } from "@/api";
import { errorOf, understood } from "@/http";
import { revisionFileUrl } from "./revision-api.js";

export type AddedOutputPreview = z.infer<typeof addedOutputPreviewSchema>;
export type AddedOutput = z.infer<typeof addedOutputSchema>;

// A refusal the add dialog shows in place: the server's sentence, and the fields Settings
// needs when a choice is missing.
export interface OutputRefusal {
  readonly ok: false;
  readonly reason: string;
  readonly message: string;
  readonly fields: readonly { readonly field: string; readonly message: string }[];
}
export type OutputReply<T> = { readonly ok: true; readonly value: T } | OutputRefusal;

const problemSchema = z.object({
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  reason: z.string().optional(),
  fields: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});

async function post<T>(
  api: Api,
  projectId: string,
  suffix: string,
  schema: z.ZodType<T>,
  body: unknown,
): Promise<OutputReply<T>> {
  const response = await api.fetch(
    `${api.origin}/api/projects/${encodeURIComponent(projectId)}${suffix}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw errorOf(response, undefined);
  }
  if (response.ok) return { ok: true, value: understood(schema, raw) };
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) throw errorOf(response, undefined);
  const problem = parsed.data;
  if (![400, 404, 409].includes(response.status))
    throw errorOf(response, {
      title: problem.title,
      status: problem.status,
      ...(problem.detail === undefined ? {} : { detail: problem.detail }),
    });
  return {
    ok: false,
    reason: problem.reason ?? "invalid-request",
    message: problem.detail ?? problem.title,
    fields: problem.fields ?? [],
  };
}

export function previewAddedOutput(
  api: Api,
  projectId: string,
  input: { readonly baseRevisionId: string; readonly kind: AddableOutput },
): Promise<OutputReply<AddedOutputPreview>> {
  return post(api, projectId, "/outputs/preview", addedOutputPreviewSchema, input);
}

export function addProjectOutput(
  api: Api,
  projectId: string,
  input: {
    readonly baseRevisionId: string;
    readonly kind: AddableOutput;
    readonly idempotencyKey: string;
    readonly adapt?: boolean;
  },
): Promise<OutputReply<AddedOutput>> {
  return post(api, projectId, "/outputs", addedOutputSchema, input);
}

export type ZipSet = "images" | "thumbnails" | "shorts";

// One zip of a set: every picture, the thumbnails or the shorts of the version shown, or only
// the records picked (`only`), so the file holds exactly what the list showed.
export function setZipUrl(
  api: Api,
  projectId: string,
  revisionId: string | null,
  set: ZipSet,
  only?: readonly string[],
): string {
  if (revisionId === null) return fileUrl(api, projectId, `${set}.zip`);
  const url = revisionFileUrl(api, projectId, revisionId, `${set}.zip`);
  return only === undefined ? url : `${url}?only=${only.map(encodeURIComponent).join(",")}`;
}

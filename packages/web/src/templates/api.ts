import type { DraftView, PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { draftViewSchema, playDraftDocumentSchema } from "@app/slices/play-drafts/schema.js";
import type { UseQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { Api } from "@/api";
import { errorOf, understood } from "@/http";

const summarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});
const templateSchema = summarySchema.extend({ document: playDraftDocumentSchema });
const templateReplySchema = z.union([
  templateSchema,
  z.object({ template: templateSchema }).transform((value) => value.template),
]);
const problemSchema = z.object({
  title: z.string(),
  detail: z.string().optional(),
  reason: z.string().optional(),
});
export type TemplateSummary = z.infer<typeof summarySchema>;
export type ProjectTemplate = z.infer<typeof templateSchema>;
export type TemplateReply<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string; readonly reason: string };
export const templatesKey = ["project-templates"] as const;
const root = (api: Api): string => `${api.origin}/api/project-templates`;

async function responseOf<T>(response: Response, schema: z.ZodType<T>): Promise<TemplateReply<T>> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw errorOf(response, undefined);
  }
  if (response.ok) return { ok: true, value: understood(schema, raw) };
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) throw errorOf(response, undefined);
  const message = parsed.data.detail ?? parsed.data.title;
  if (![400, 404, 409].includes(response.status)) throw new Error(message);
  return { ok: false, message, reason: parsed.data.reason ?? "invalid-request" };
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
export async function listProjectTemplates(
  api: Api,
): Promise<TemplateReply<readonly TemplateSummary[]>> {
  return responseOf(
    await api.fetch(root(api)),
    z.object({ templates: z.array(summarySchema) }).transform((value) => value.templates),
  );
}
export function templatesQuery(api: Api): UseQueryOptions<readonly TemplateSummary[]> {
  return {
    queryKey: templatesKey,
    queryFn: async () => {
      const reply = await listProjectTemplates(api);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
  };
}
export async function readProjectTemplate(
  api: Api,
  id: string,
): Promise<TemplateReply<ProjectTemplate>> {
  return responseOf(await api.fetch(`${root(api)}/${encodeURIComponent(id)}`), templateReplySchema);
}
export async function saveProjectTemplate(
  api: Api,
  input: { readonly id: string; readonly name: string; readonly document: PlayDraftDocument },
): Promise<TemplateReply<ProjectTemplate>> {
  const body = z
    .object({ id: z.uuid(), name: z.string().trim().min(1), document: playDraftDocumentSchema })
    .parse(input);
  return responseOf(await api.fetch(root(api), json("POST", body)), templateReplySchema);
}
export async function updateProjectTemplate(
  api: Api,
  id: string,
  input: {
    readonly baseVersion: number;
    readonly mutationId: string;
    readonly name: string;
    readonly document: PlayDraftDocument;
  },
): Promise<TemplateReply<ProjectTemplate>> {
  const body = z
    .object({
      baseVersion: z.number().int().positive(),
      mutationId: z.uuid(),
      name: z.string().trim().min(1),
      document: playDraftDocumentSchema,
    })
    .parse(input);
  return responseOf(
    await api.fetch(`${root(api)}/${encodeURIComponent(id)}`, json("PUT", body)),
    templateReplySchema,
  );
}
export async function saveTemplateFromProject(
  api: Api,
  projectId: string,
  input: { readonly id: string; readonly name: string; readonly revisionId: string },
): Promise<TemplateReply<ProjectTemplate>> {
  const body = z
    .object({
      id: z.uuid(),
      name: z.string().trim().min(1).max(200),
      revisionId: z.string().min(1).max(64),
    })
    .parse(input);
  return responseOf(
    await api.fetch(
      `${root(api)}/from-project/${encodeURIComponent(projectId)}`,
      json("POST", body),
    ),
    templateReplySchema,
  );
}
export async function deleteProjectTemplate(
  api: Api,
  template: Pick<TemplateSummary, "id" | "version">,
): Promise<TemplateReply<null>> {
  const response = await api.fetch(
    `${root(api)}/${encodeURIComponent(template.id)}`,
    json("DELETE", { baseVersion: template.version }),
  );
  if (response.ok) return { ok: true, value: null };
  return responseOf(response, z.null());
}
export async function instantiateProjectTemplate(
  api: Api,
  template: Pick<TemplateSummary, "id" | "version">,
  draftId: string,
): Promise<TemplateReply<DraftView>> {
  const body = z
    .object({ id: z.uuid(), version: z.number().int().positive() })
    .parse({ id: draftId, version: template.version });
  return responseOf(
    await api.fetch(
      `${root(api)}/${encodeURIComponent(template.id)}/instantiate`,
      json("POST", body),
    ),
    z.union([
      draftViewSchema,
      z.object({ draft: draftViewSchema }).transform((value) => value.draft),
    ]),
  );
}

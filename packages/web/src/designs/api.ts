import type { DesignFormat, DesignStep, DesignView } from "@app/slices/designs/model.js";
import type { DesignDocument } from "@app/slices/designs/schema.js";
import type { TemplateCheck } from "@app/slices/designs/template-checks.js";
import type { DesignTemplate } from "@app/slices/designs/templates.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { errorOf, problemOf } from "@/http";
import { keys } from "@/queries";

// Library → Designs over HTTP (`edge/http/designs.ts`, `design-templates.ts`). A refusal comes
// back as a value with the server's own sentence; a paid step refused because the price moved
// carries the new quote, so the button can show it and be pressed again.

export type { DesignStep, DesignTemplate, DesignView, TemplateCheck };

export interface SampleView {
  readonly state: "queued" | "making" | "done" | "failed" | "held";
  readonly version: number;
  readonly designId: string | null;
  readonly heldReason: string | null;
  readonly quotedHigh: number | null;
}

export type TemplateView = DesignTemplate & { readonly sample: SampleView | null };

export type SaveQuote = CostEstimate & {
  readonly sections: readonly string[];
  readonly makesPicture: boolean;
};

export type DesignReply<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly message: string;
      readonly reason: string;
      readonly quote?: CostEstimate | undefined;
      readonly checks?: readonly TemplateCheck[] | undefined;
      readonly current?: unknown;
    };

const designsRoot = (api: Api): string => `${api.origin}/api/designs`;
const templatesRoot = (api: Api): string => `${api.origin}/api/design-templates`;
const at = (id: string): string => encodeURIComponent(id);
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function reply<T>(response: Response): Promise<DesignReply<T>> {
  if (response.ok)
    return {
      ok: true,
      value: (response.status === 204 ? null : await response.json()) as T,
    };
  const problem = (await problemOf(response.clone())) as
    | (Awaited<ReturnType<typeof problemOf>> & {
        readonly reason?: string;
        readonly quote?: CostEstimate;
        readonly checks?: readonly TemplateCheck[];
        readonly current?: unknown;
      })
    | undefined;
  if (problem === undefined || response.status >= 500) throw errorOf(response, problem);
  return {
    ok: false,
    message: problem.detail ?? problem.title,
    reason: problem.reason ?? "refused",
    quote: problem.quote,
    checks: problem.checks,
    current: problem.current,
  };
}

async function value<T>(response: Response): Promise<T> {
  const result = await reply<T>(response);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

// Designs

export function designsQuery(api: Api, projectId?: string) {
  return queryOptions({
    queryKey: projectId === undefined ? keys.designs : [...keys.designs, "project", projectId],
    queryFn: async () =>
      (
        await value<{ readonly designs: readonly DesignView[] }>(
          await api.fetch(
            projectId === undefined
              ? designsRoot(api)
              : `${designsRoot(api)}?projectId=${at(projectId)}`,
          ),
        )
      ).designs,
  });
}

export function designQuery(api: Api, id: string) {
  return queryOptions({
    queryKey: [...keys.designs, id],
    queryFn: async () => value<DesignView>(await api.fetch(`${designsRoot(api)}/${at(id)}`)),
    // A picture being made lands by `design.changed`; this is the backstop.
    refetchInterval: (query) =>
      query.state.data?.steps.some((step) => step.state === "making") === true ? 5000 : false,
  });
}

export interface UploadedPicture {
  readonly sha256: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

export async function uploadPicture(api: Api, file: File): Promise<DesignReply<UploadedPicture>> {
  return reply(
    await api.fetch(`${designsRoot(api)}/pictures`, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    }),
  );
}

export async function createDesign(
  api: Api,
  input: {
    readonly id: string;
    readonly mutationId: string;
    readonly kind: "edit" | "design";
    readonly name: string;
    readonly projectId?: string;
    readonly fromStepSha?: string;
    readonly document?: DesignDocument;
    readonly values?: Readonly<Record<string, string>>;
  },
): Promise<DesignReply<DesignView>> {
  return reply(await api.fetch(designsRoot(api), json("POST", input)));
}

export async function updateDesign(
  api: Api,
  id: string,
  input: {
    readonly baseUpdatedAt: string;
    readonly name?: string;
    readonly projectId?: string | null;
    readonly document?: DesignDocument;
    readonly values?: Readonly<Record<string, string>>;
  },
): Promise<DesignReply<DesignView>> {
  return reply(await api.fetch(`${designsRoot(api)}/${at(id)}`, json("PUT", input)));
}

export async function deleteDesign(api: Api, id: string): Promise<DesignReply<null>> {
  return reply(await api.fetch(`${designsRoot(api)}/${at(id)}`, { method: "DELETE" }));
}

export async function quoteEdit(
  api: Api,
  id: string,
  input: { readonly provider: string; readonly model: string },
): Promise<DesignReply<CostEstimate>> {
  return reply(await api.fetch(`${designsRoot(api)}/${at(id)}/quote`, json("POST", input)));
}

export async function quoteArtwork(api: Api, id: string): Promise<DesignReply<CostEstimate>> {
  return reply(await api.fetch(`${designsRoot(api)}/${at(id)}/artwork/quote`, { method: "POST" }));
}

export async function editPicture(
  api: Api,
  id: string,
  input: {
    readonly mutationId: string;
    readonly fromStepId: string;
    readonly instruction: string;
    readonly provider: string;
    readonly model: string;
    readonly acknowledgedHigh: number;
  },
): Promise<DesignReply<DesignView>> {
  return reply(await api.fetch(`${designsRoot(api)}/${at(id)}/edit`, json("POST", input)));
}

export async function makeArtwork(
  api: Api,
  id: string,
  input: { readonly mutationId: string; readonly acknowledgedHigh: number },
): Promise<DesignReply<DesignView>> {
  return reply(await api.fetch(`${designsRoot(api)}/${at(id)}/artwork`, json("POST", input)));
}

export async function retryStep(
  api: Api,
  id: string,
  stepId: string,
): Promise<DesignReply<DesignView>> {
  return reply(
    await api.fetch(`${designsRoot(api)}/${at(id)}/steps/${at(stepId)}/retry`, { method: "POST" }),
  );
}

export async function continueFrom(
  api: Api,
  id: string,
  stepId: string,
): Promise<DesignReply<DesignView>> {
  return reply(await api.fetch(`${designsRoot(api)}/${at(id)}/head`, json("PUT", { stepId })));
}

export function stepPictureUrl(api: Api, designId: string, stepId: string): string {
  return `${designsRoot(api)}/${at(designId)}/steps/${at(stepId)}/picture`;
}

// Drawn on demand; `stamp` (the design's updatedAt) makes a changed design draw again.
export function designFileUrl(
  api: Api,
  designId: string,
  format: DesignFormat,
  type: "png" | "pdf",
  stamp?: string,
): string {
  return `${designsRoot(api)}/${at(designId)}/files/${format}.${type}${stamp === undefined ? "" : `?v=${encodeURIComponent(stamp)}`}`;
}

// Design templates

export function designTemplatesQuery(api: Api) {
  return queryOptions({
    queryKey: keys.designTemplates,
    queryFn: async () =>
      (
        await value<{ readonly templates: readonly DesignTemplate[] }>(
          await api.fetch(templatesRoot(api)),
        )
      ).templates,
  });
}

export function designTemplateQuery(api: Api, id: string) {
  return queryOptions({
    queryKey: [...keys.designTemplates, id],
    queryFn: async () => value<TemplateView>(await api.fetch(`${templatesRoot(api)}/${at(id)}`)),
    refetchInterval: (query) => {
      const state = query.state.data?.sample?.state;
      return state === "making" || state === "queued" ? 5000 : false;
    },
  });
}

export async function createDesignTemplate(
  api: Api,
  input: {
    readonly id: string;
    readonly mutationId: string;
    readonly name: string;
    readonly document: DesignDocument;
  },
): Promise<DesignReply<DesignTemplate>> {
  return reply(await api.fetch(templatesRoot(api), json("POST", input)));
}

export async function saveDesignTemplate(
  api: Api,
  id: string,
  input: {
    readonly baseVersion: number;
    readonly name: string;
    readonly document: DesignDocument;
    readonly sample: "make" | "skip";
    readonly acknowledgedHigh: number;
  },
): Promise<
  DesignReply<{
    readonly template: DesignTemplate;
    readonly saved: boolean;
    readonly sample: SampleView | { readonly refused: string } | null;
  }>
> {
  return reply(await api.fetch(`${templatesRoot(api)}/${at(id)}`, json("PUT", input)));
}

export async function quoteTemplateSave(
  api: Api,
  id: string,
  document: DesignDocument,
): Promise<DesignReply<SaveQuote>> {
  return reply(
    await api.fetch(`${templatesRoot(api)}/${at(id)}/quote`, json("POST", { document })),
  );
}

// What one piece from the newest version costs: the sample's price too.
export function pieceQuoteQuery(api: Api, id: string, version: number) {
  return queryOptions({
    queryKey: [...keys.designTemplates, id, "piece-quote", version],
    queryFn: async () =>
      value<CostEstimate>(
        await api.fetch(`${templatesRoot(api)}/${at(id)}/quote`, { method: "POST" }),
      ),
  });
}

export async function markReady(
  api: Api,
  id: string,
  version: number,
): Promise<DesignReply<DesignTemplate>> {
  return reply(await api.fetch(`${templatesRoot(api)}/${at(id)}/ready`, json("POST", { version })));
}

export async function makeSample(
  api: Api,
  id: string,
  version: number,
  acknowledgedHigh: number,
): Promise<DesignReply<SampleView>> {
  return reply(
    await api.fetch(
      `${templatesRoot(api)}/${at(id)}/sample`,
      json("POST", { version, acknowledgedHigh }),
    ),
  );
}

export async function deleteDesignTemplate(api: Api, id: string): Promise<DesignReply<null>> {
  return reply(await api.fetch(`${templatesRoot(api)}/${at(id)}`, { method: "DELETE" }));
}

// The words on a paid button: "about $0.04", "plan usage", or that the price isn't known.
export function priceWords(quote: CostEstimate | undefined): string {
  if (quote === undefined) return "pricing…";
  if (quote.unknown > 0) return "price unknown";
  if (quote.high === 0)
    return quote.rows.some((row) => row.onPlan === true) ? "plan usage" : "free";
  const high = `$${quote.high.toFixed(2)}`;
  return quote.low === quote.high ? `about ${high}` : `up to ${high}`;
}

// One piece made by hand from a template's saved version; the server draws it at once.
export async function makePiece(
  api: Api,
  id: string,
  input: {
    readonly mutationId: string;
    readonly version: number;
    readonly values: Readonly<Record<string, string>>;
    readonly acknowledgedHigh: number;
  },
): Promise<DesignReply<DesignView>> {
  return reply(await api.fetch(`${templatesRoot(api)}/${at(id)}/make`, json("POST", input)));
}

import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import {
  type AnatomyViewData,
  anatomyViewSchema,
  type SampleQuoteView,
  type StudioChecks,
  type StudioView,
  sampleQuoteSchema,
  studioChecksSchema,
  studioViewSchema,
} from "@app/slices/template-studio/schema.js";
import type { UseQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { Api } from "@/api";
import { failure, understood } from "@/http";

// Library → Templates → Open studio reads one template's studio: its sections, samples and
// free checks (`/api/template-studio`, not the YouTube Studio pack's `/api/studio`).
export const templateStudioKey = (id: string) => ["template-studio", id] as const;

export async function readTemplateStudio(api: Api, id: string): Promise<StudioView> {
  const response = await api.fetch(`${api.origin}/api/template-studio/${encodeURIComponent(id)}`);
  if (!response.ok) throw await failure(response);
  return understood(studioViewSchema, await response.json());
}

export function templateStudioQuery(api: Api, id: string): UseQueryOptions<StudioView> {
  return { queryKey: templateStudioKey(id), queryFn: () => readTemplateStudio(api, id) };
}

// The free checks, read apart from the studio: they wait on the providers' readiness, which
// takes seconds, and the studio never waits for them.
export function templateChecksQuery(api: Api, id: string): UseQueryOptions<StudioChecks> {
  return {
    queryKey: [...templateStudioKey(id), "checks"],
    queryFn: async () => {
      const response = await api.fetch(
        `${api.origin}/api/template-studio/${encodeURIComponent(id)}/checks`,
      );
      if (!response.ok) throw await failure(response);
      return understood(studioChecksSchema, await response.json());
    },
  };
}

// Make samples: queues the free samples of the template's current version.
export async function requestFreeSamples(api: Api, id: string): Promise<void> {
  const response = await api.fetch(
    `${api.origin}/api/template-studio/${encodeURIComponent(id)}/free-samples`,
    { method: "POST" },
  );
  if (!response.ok) throw await failure(response);
}

// A refusal the studio expects (a higher price, unknown prices, past the budget, an older
// version): the server's sentence, its reason, and the new quote when it sent one.
export interface StudioRefusal {
  readonly ok: false;
  readonly reason: string;
  readonly message: string;
  readonly quote: SampleQuoteView | null;
}

const refusalSchema = z
  .object({
    detail: z.string().optional(),
    title: z.string().optional(),
    reason: z.string().optional(),
    quote: sampleQuoteSchema.optional(),
  })
  .loose();

async function answered<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<{ readonly ok: true; readonly value: T } | StudioRefusal> {
  if (response.ok) return { ok: true, value: understood(schema, await response.json()) };
  if (response.status === 400 || response.status === 409) {
    const parsed = refusalSchema.safeParse(await response.json());
    if (parsed.success)
      return {
        ok: false,
        reason: parsed.data.reason ?? "conflict",
        message: parsed.data.detail ?? parsed.data.title ?? "Slopify refused the request.",
        quote: parsed.data.quote ?? null,
      };
  }
  throw await failure(response);
}

const base = (api: Api, id: string) =>
  `${api.origin}/api/template-studio/${encodeURIComponent(id)}`;
const post = (method: "POST" | "PUT", body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export type QuoteAsk =
  | { readonly document: PlayDraftDocument }
  | { readonly topic: string }
  | { readonly fullScript: boolean };

// What a Save, a new topic or the full script would cost. Prices only; nothing changes.
export async function quoteSample(api: Api, id: string, ask: QuoteAsk): Promise<SampleQuoteView> {
  const response = await api.fetch(`${base(api, id)}/quote`, post("POST", ask));
  if (!response.ok) throw await failure(response);
  return understood(sampleQuoteSchema, await response.json());
}

const savedSchema = z
  .object({
    template: z.object({ version: z.number() }).loose(),
    sample: z.enum(["queued", "skipped"]),
    replayed: z.boolean(),
  })
  .loose();

export function saveInStudio(
  api: Api,
  id: string,
  input: {
    readonly mutationId: string;
    readonly baseVersion: number;
    readonly name: string;
    readonly document: PlayDraftDocument;
    readonly sample: "make" | "skip";
    readonly acknowledgedHigh: number;
    readonly acknowledgedUnknown: boolean;
  },
) {
  return api
    .fetch(`${base(api, id)}/save`, post("POST", input))
    .then((r) => answered(r, savedSchema));
}

export function makeSample(
  api: Api,
  id: string,
  input: {
    readonly version: number;
    readonly acknowledgedHigh: number;
    readonly acknowledgedUnknown: boolean;
  },
) {
  return api
    .fetch(`${base(api, id)}/samples/make`, post("POST", input))
    .then((r) => answered(r, z.object({ queued: z.literal(true) }).loose()));
}

const changedSchema = z
  .object({ topic: z.string(), topicSource: z.enum(["fixed", "queued"]), fullScript: z.boolean() })
  .loose();

export function changeTopic(
  api: Api,
  id: string,
  input: {
    readonly topic: string;
    readonly acknowledgedHigh: number;
    readonly acknowledgedUnknown: boolean;
  },
) {
  return api
    .fetch(`${base(api, id)}/topic`, post("PUT", input))
    .then((r) => answered(r, changedSchema));
}

export function changeFullScript(
  api: Api,
  id: string,
  input: {
    readonly fullScript: boolean;
    readonly acknowledgedHigh: number;
    readonly acknowledgedUnknown: boolean;
  },
) {
  return api
    .fetch(`${base(api, id)}/full-script`, post("POST", input))
    .then((r) => answered(r, changedSchema));
}

export function anatomyQuery(
  api: Api,
  id: string,
  section: TemplateSection,
  item: string | undefined,
  version: number,
): UseQueryOptions<AnatomyViewData> {
  return {
    queryKey: [...templateStudioKey(id), "anatomy", section, item ?? "", version],
    queryFn: async () => {
      const query = new URLSearchParams({ section, ...(item === undefined ? {} : { item }) });
      const response = await api.fetch(`${base(api, id)}/anatomy?${query.toString()}`);
      if (!response.ok) throw await failure(response);
      return understood(anatomyViewSchema, await response.json());
    },
  };
}

// Settings → Template studio: the samples' daily budget and what they spent today.
export const studioSettingsSchema = z
  .object({
    dailyBudget: z.number(),
    today: z.object({ budget: z.number(), spent: z.number(), left: z.number() }),
  })
  .loose();
export type StudioSettingsView = z.infer<typeof studioSettingsSchema>;
export const studioSettingsKey = ["template-studio", "settings"] as const;

export async function readStudioSettings(api: Api): Promise<StudioSettingsView> {
  const response = await api.fetch(`${api.origin}/api/template-studio/settings`);
  if (!response.ok) throw await failure(response);
  return understood(studioSettingsSchema, await response.json());
}

export async function writeStudioSettings(
  api: Api,
  dailyBudget: number,
): Promise<StudioSettingsView> {
  const response = await api.fetch(
    `${api.origin}/api/template-studio/settings`,
    post("PUT", { dailyBudget }),
  );
  if (!response.ok) throw await failure(response);
  return understood(studioSettingsSchema, await response.json());
}

// "about $0.12", the way every price in the studio is said.
export function about(high: number): string {
  return `about $${high.toFixed(2)}`;
}

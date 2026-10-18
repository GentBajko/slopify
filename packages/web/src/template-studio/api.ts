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
import { failure, jsonOf, refusalFrom, understood } from "@/http";
import { usd } from "@/lib/format";

// Library → Templates → Open studio reads one template's studio: its sections, samples and
// free checks (`/api/template-studio`, not the YouTube Studio pack's `/api/studio`).
export const templateStudioKey = (id: string) => ["template-studio", id] as const;

// No such project template: the id may name a design template, which the page opens instead,
// so it is said at once rather than asked again.
export class StudioNotFound extends Error {}

export async function readTemplateStudio(api: Api, id: string): Promise<StudioView> {
  const response = await api.fetch(`${api.origin}/api/template-studio/${encodeURIComponent(id)}`);
  if (response.status === 404) throw new StudioNotFound((await failure(response)).message);
  if (!response.ok) throw await failure(response);
  return understood(studioViewSchema, await response.json());
}

export function templateStudioQuery(api: Api, id: string): UseQueryOptions<StudioView> {
  return {
    queryKey: templateStudioKey(id),
    queryFn: () => readTemplateStudio(api, id),
    retry: (count, error) => !(error instanceof StudioNotFound) && count < 3,
  };
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

// The studio's refusals are 400 (invalid) and 409 (changed, priced higher, past the budget);
// a missing template (404) is a fault the page shows as an error.
const studioRefusals = { statuses: [400, 409] } as const;

// The extensions a studio refusal may carry beside the shared ones `refusalFrom` reads.
function extension<T>(raw: unknown, key: string, schema: z.ZodType<T>): T | undefined {
  const parsed = z
    .object({ [key]: schema })
    .loose()
    .safeParse(raw);
  return parsed.success ? (parsed.data[key] as T) : undefined;
}

async function answered<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<{ readonly ok: true; readonly value: T } | StudioRefusal> {
  const raw = await jsonOf(response);
  if (response.ok) return { ok: true, value: understood(schema, raw) };
  const refusal = refusalFrom(response, raw, studioRefusals);
  return {
    ok: false,
    reason: refusal.reason ?? "conflict",
    message: refusal.message,
    quote: extension(raw, "quote", sampleQuoteSchema) ?? null,
  };
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

// "about $0.12", the way every price in the studio is said; a fraction of a cent keeps its
// digits ("about $0.0032"), never "$0.00".
export function about(high: number): string {
  return `about ${usd(high)}`;
}

// Settings → Template studio → Make samples for all: every template needing a sample, priced
// together first.
export const forAllQuoteSchema = z
  .object({
    items: z.array(
      z
        .object({
          templateId: z.string(),
          name: z.string(),
          version: z.number(),
          high: z.number(),
          unknown: z.number(),
          fits: z.boolean(),
          problem: z.string().nullable(),
        })
        .loose(),
    ),
    total: z.number(),
    fitting: z.number(),
    sentence: z.string(),
  })
  .loose();
export type ForAllQuoteView = z.infer<typeof forAllQuoteSchema>;
export const forAllKey = ["template-studio", "samples-for-all"] as const;

export async function quoteSamplesForAll(api: Api): Promise<ForAllQuoteView> {
  const response = await api.fetch(`${api.origin}/api/template-studio/samples-for-all/quote`, {
    method: "POST",
  });
  if (!response.ok) throw await failure(response);
  return understood(forAllQuoteSchema, await response.json());
}

export async function makeSamplesForAll(
  api: Api,
  input: { readonly acknowledgedTotal: number; readonly acknowledgedUnknown: boolean },
): Promise<
  | { readonly ok: true; readonly queued: number; readonly held: number }
  | { readonly ok: false; readonly message: string; readonly quote: ForAllQuoteView | null }
> {
  const response = await api.fetch(
    `${api.origin}/api/template-studio/samples-for-all`,
    post("POST", input),
  );
  const raw = await jsonOf(response);
  if (response.ok) {
    const value = understood(
      z.object({ queued: z.array(z.string()), held: z.array(z.string()) }).loose(),
      raw,
    );
    return { ok: true, queued: value.queued.length, held: value.held.length };
  }
  return {
    ok: false,
    message: refusalFrom(response, raw, studioRefusals).message,
    quote: extension(raw, "quote", forAllQuoteSchema) ?? null,
  };
}

const readyProblemSchema = z
  .object({
    label: z.string(),
    sentence: z.string(),
    fix: z.object({ label: z.string(), href: z.string() }).optional(),
    section: z.string().optional(),
  })
  .loose();
export type ReadyProblemView = z.infer<typeof readyProblemSchema>;

// Mark ready: the newest version becomes the one its schedules run, or the things to fix first.
export async function markTemplateReady(
  api: Api,
  id: string,
  version: number,
): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly problems: readonly ReadyProblemView[] }
> {
  const response = await api.fetch(`${base(api, id)}/ready`, post("POST", { version }));
  if (response.ok) return { ok: true };
  const raw = await jsonOf(response);
  return {
    ok: false,
    message: refusalFrom(response, raw, studioRefusals).message,
    problems: extension(raw, "problems", z.array(readyProblemSchema)) ?? [],
  };
}

// Voice → Say it as: the names the sample's script says, and saying one another way.
export const pronunciationsSchema = z
  .object({
    names: z.array(
      z
        .object({
          term: z.string(),
          ipa: z.array(z.string()),
          line: z.string().nullable(),
          spokenAs: z.string().nullable(),
        })
        .loose(),
    ),
    aliasesOn: z.boolean(),
    voice: z.object({ provider: z.string(), model: z.string(), voice: z.string() }).nullable(),
    problem: z.string().nullable(),
  })
  .loose();
export type PronunciationsView = z.infer<typeof pronunciationsSchema>;

export function pronunciationsQuery(
  api: Api,
  id: string,
  revision: string | null,
): UseQueryOptions<PronunciationsView> {
  return {
    queryKey: [...templateStudioKey(id), "pronunciations", revision ?? ""],
    queryFn: async () => {
      const response = await api.fetch(`${base(api, id)}/pronunciations`);
      if (!response.ok) throw await failure(response);
      return understood(pronunciationsSchema, await response.json());
    },
  };
}

export const sayItAsQuoteSchema = z
  .object({
    lines: z.number(),
    high: z.number(),
    unknown: z.number(),
    fits: z.boolean(),
    problem: z.string().nullable(),
  })
  .loose();
export type SayItAsQuoteView = z.infer<typeof sayItAsQuoteSchema>;

export async function quoteSayItAs(
  api: Api,
  id: string,
  ask: { readonly written: string; readonly spoken: string },
): Promise<SayItAsQuoteView> {
  const response = await api.fetch(`${base(api, id)}/say-it-as/quote`, post("POST", ask));
  if (!response.ok) throw await failure(response);
  return understood(sayItAsQuoteSchema, await response.json());
}

export function saveSayItAs(
  api: Api,
  id: string,
  input: {
    readonly written: string;
    readonly spoken: string;
    readonly acknowledgedHigh: number;
    readonly acknowledgedUnknown: boolean;
  },
) {
  return api
    .fetch(`${base(api, id)}/say-it-as`, post("POST", input))
    .then((r) => answered(r, z.object({ queued: z.boolean() }).loose()));
}

// Export pack: the version marked ready as a zip, or the reason there is none.
export async function downloadPack(
  api: Api,
  id: string,
): Promise<
  | { readonly ok: true; readonly filename: string; readonly blob: Blob }
  | { readonly ok: false; readonly message: string }
> {
  const response = await api.fetch(`${base(api, id)}/pack`);
  if (response.ok) {
    const named = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "");
    return {
      ok: true,
      filename: named?.[1] ?? "template.slopify-pack.zip",
      blob: await response.blob(),
    };
  }
  return {
    ok: false,
    message: refusalFrom(response, await jsonOf(response), studioRefusals).message,
  };
}

export const importedPackSchema = z
  .object({
    templateId: z.string(),
    name: z.string(),
    added: z.number(),
    renamed: z.array(z.object({ from: z.string(), to: z.string() }).loose()),
    voiceKnown: z.boolean(),
    samples: z.number(),
  })
  .loose();
export type ImportedPackView = z.infer<typeof importedPackSchema>;

// Import pack: a pack's .zip becomes a new, unchecked template.
export async function importTemplatePack(
  api: Api,
  file: File,
): Promise<
  | { readonly ok: true; readonly value: ImportedPackView }
  | { readonly ok: false; readonly message: string }
> {
  const body = new FormData();
  body.set("file", file);
  const response = await api.fetch(`${api.origin}/api/template-studio/packs/import`, {
    method: "POST",
    body,
  });
  const raw = await jsonOf(response);
  if (response.ok) return { ok: true, value: understood(importedPackSchema, raw) };
  return { ok: false, message: refusalFrom(response, raw, { statuses: [400, 409, 413] }).message };
}

const packSamplesSchema = z
  .object({
    samples: z.array(
      z
        .object({
          role: z.enum(["thumbnail", "picture", "narration"]),
          name: z.string(),
          url: z.string(),
        })
        .loose(),
    ),
  })
  .loose();
export type PackSamplesView = z.infer<typeof packSamplesSchema>;

// The samples an imported pack came with.
export function packSamplesQuery(api: Api, id: string): UseQueryOptions<PackSamplesView> {
  return {
    queryKey: [...templateStudioKey(id), "pack-samples"],
    queryFn: async () => {
      const response = await api.fetch(`${base(api, id)}/pack-samples`);
      if (!response.ok) throw await failure(response);
      return understood(packSamplesSchema, await response.json());
    },
  };
}

// Compare models (the bake-off): one section's sample on one or two other models.
export type BakeoffSection = "script" | "voice" | "pictures";
export interface BakeoffPick {
  readonly provider: string;
  readonly model: string;
}

export const bakeoffQuoteSchema = z
  .object({
    version: z.number(),
    section: z.enum(["script", "voice", "pictures"]),
    current: z.object({ provider: z.string(), model: z.string() }).loose(),
    models: z.array(
      z
        .object({
          provider: z.string(),
          model: z.string(),
          high: z.number(),
          unknown: z.number(),
          onPlan: z.boolean(),
          problem: z.string().nullable(),
        })
        .loose(),
    ),
    high: z.number(),
    unknown: z.number(),
    budget: z.object({ budget: z.number(), spent: z.number(), left: z.number() }).loose(),
    fits: z.boolean(),
    problem: z.string().nullable(),
  })
  .loose();
export type BakeoffQuoteView = z.infer<typeof bakeoffQuoteSchema>;

const bakeoffEntrySchema = z
  .object({
    provider: z.string(),
    model: z.string(),
    slot: z.number().nullable(),
    state: z.enum(["current", "queued", "making", "done", "failed"]),
    quotedHigh: z.number().nullable(),
    cost: z.number().nullable(),
    seconds: z.number().nullable(),
    failure: z.string().nullable(),
    outputs: z.array(z.object({ role: z.string(), url: z.string(), name: z.string() }).loose()),
    article: z.string().nullable(),
  })
  .loose();
export const bakeoffViewSchema = z
  .object({
    bakeoff: z
      .object({
        id: z.string(),
        section: z.enum(["script", "voice", "pictures"]),
        version: z.number(),
        stale: z.boolean(),
        state: z.enum(["queued", "making", "done", "held", "failed"]),
        sentence: z.string().nullable(),
        entries: z.array(bakeoffEntrySchema),
      })
      .loose()
      .nullable(),
  })
  .loose();
export type BakeoffView = NonNullable<z.infer<typeof bakeoffViewSchema>["bakeoff"]>;
export type BakeoffEntryView = BakeoffView["entries"][number];

export function bakeoffQuery(
  api: Api,
  id: string,
): UseQueryOptions<z.infer<typeof bakeoffViewSchema>> {
  return {
    queryKey: [...templateStudioKey(id), "bakeoff"],
    queryFn: async () => {
      const response = await api.fetch(`${base(api, id)}/bakeoff`);
      if (!response.ok) throw await failure(response);
      return understood(bakeoffViewSchema, await response.json());
    },
    // The event stream says when it changes; this is the fallback while it is being made.
    refetchInterval: (query) => {
      const state = query.state.data?.bakeoff?.state;
      return state === "queued" || state === "making" ? 5000 : false;
    },
  };
}

export async function quoteBakeoff(
  api: Api,
  id: string,
  ask: { readonly section: BakeoffSection; readonly models: readonly BakeoffPick[] },
): Promise<{ readonly ok: true; readonly value: BakeoffQuoteView } | StudioRefusal> {
  const response = await api.fetch(`${base(api, id)}/bakeoff/quote`, post("POST", ask));
  return answered(response, bakeoffQuoteSchema);
}

export async function startBakeoff(
  api: Api,
  id: string,
  input: {
    readonly section: BakeoffSection;
    readonly models: readonly BakeoffPick[];
    readonly acknowledgedHigh: number;
    readonly acknowledgedUnknown: boolean;
  },
): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly quote: BakeoffQuoteView | null }
> {
  const response = await api.fetch(`${base(api, id)}/bakeoff`, post("POST", input));
  const raw = await jsonOf(response);
  if (response.ok) return { ok: true };
  return {
    ok: false,
    message: refusalFrom(response, raw, studioRefusals).message,
    quote: extension(raw, "quote", bakeoffQuoteSchema) ?? null,
  };
}

export async function discardBakeoff(
  api: Api,
  id: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
  const response = await api.fetch(`${base(api, id)}/bakeoff`, { method: "DELETE" });
  const raw = await jsonOf(response);
  if (response.ok) return { ok: true };
  return { ok: false, message: refusalFrom(response, raw, studioRefusals).message };
}

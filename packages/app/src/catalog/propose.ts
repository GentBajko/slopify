import type { Lifecycle } from "./lifecycle.js";
import type { Catalogue } from "./schema.js";

// The daily catalogue proposal (scripts/catalogue-build.ts, run by .github/workflows/
// catalogue.yml): what models.yaml and models-lifecycle.yaml should say given OpenRouter's
// public metadata today. Pure, so every rule is tested without a network; the script validates
// the result with the same v1 schema every install reads, and a person merges the PR.

// One row of https://openrouter.ai/api/v1/models, read loosely: anything missing is left as
// the catalogue has it.
export interface OpenRouterModel {
  readonly id: string;
  readonly name?: string | undefined;
  readonly created?: number | undefined;
  readonly contextLength?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly promptPerToken?: number | undefined;
  readonly completionPerToken?: number | undefined;
  readonly cachedPerToken?: number | undefined;
  readonly inputs?: readonly string[] | undefined;
  readonly outputs?: readonly string[] | undefined;
  readonly reasoning?: boolean | undefined;
}

export interface ProposalSources {
  readonly openRouter: readonly OpenRouterModel[];
  // YYYY-MM-DD, the day the proposal is made.
  readonly today: string;
}

export interface Proposal {
  readonly catalogue: Catalogue;
  readonly lifecycle: Lifecycle;
  readonly added: readonly string[];
  readonly retired: readonly string[];
  readonly priced: readonly string[];
  readonly changed: boolean;
}

// ceiling: a new OpenRouter model is proposed only from a vendor the list already carries,
// only when it was published in the last 60 days, and at most 10 a day, so the PR stays
// reviewable and the list stays curated.
export const newWithinDays = 60;
export const newPerRun = 10;
const source = "https://openrouter.ai/api/v1/models";

const perMillion = (perToken: number | undefined): number | undefined =>
  perToken === undefined ? undefined : Math.round(perToken * 1e6 * 1e6) / 1e6;

function rateNote(today: string): string {
  return `Public OpenRouter rates read ${today}; routing, long context, reasoning and web search may add charges.`;
}

type LlmRow = Catalogue["llm"][number];

const reasoningThinking = {
  low: { effort: "low" },
  medium: { effort: "medium" },
  high: { effort: "high" },
} as const;

function refreshed(
  row: LlmRow,
  live: OpenRouterModel,
  today: string,
): {
  readonly row: LlmRow;
  readonly priced: boolean;
} {
  const input = perMillion(live.promptPerToken);
  const output = perMillion(live.completionPerToken);
  const cached = perMillion(live.cachedPerToken);
  const priced =
    (input !== undefined && input !== row.pricing.inputPerMillionTokens) ||
    (output !== undefined && output !== row.pricing.outputPerMillionTokens);
  const pricing = priced
    ? {
        ...row.pricing,
        ...(input === undefined ? {} : { inputPerMillionTokens: input }),
        ...(output === undefined ? {} : { outputPerMillionTokens: output }),
        ...(cached === undefined ? {} : { cachedInputPerMillionTokens: cached }),
        note: rateNote(today),
      }
    : row.pricing;
  const llm = {
    ...row.llm,
    ...(live.contextLength === undefined ? {} : { contextTokens: live.contextLength }),
    ...(live.maxOutputTokens === undefined ? {} : { maxOutputTokens: live.maxOutputTokens }),
    ...(row.llm.thinking === undefined && live.reasoning === true
      ? { thinking: reasoningThinking }
      : {}),
  };
  return { row: { ...row, pricing, llm }, priced };
}

function proposedRow(live: OpenRouterModel, today: string): LlmRow {
  const input = perMillion(live.promptPerToken);
  const output = perMillion(live.completionPerToken);
  return {
    provider: "openrouter",
    id: live.id,
    name: (live.name ?? live.id).slice(0, 120),
    enabled: true,
    deprecated: false,
    source,
    keywords: ["llm"],
    pricing: {
      ...(input === undefined ? {} : { inputPerMillionTokens: input }),
      ...(output === undefined ? {} : { outputPerMillionTokens: output }),
      note: rateNote(today),
    },
    llm: {
      webSearch: false,
      ...(live.contextLength === undefined ? {} : { contextTokens: live.contextLength }),
      ...(live.maxOutputTokens === undefined ? {} : { maxOutputTokens: live.maxOutputTokens }),
      ...(live.reasoning === true ? { thinking: reasoningThinking } : {}),
    },
  };
}

function isNew(live: OpenRouterModel, vendors: ReadonlySet<string>, today: string): boolean {
  if (live.id.includes(":")) return false;
  const vendor = live.id.split("/")[0] ?? "";
  if (!vendors.has(vendor)) return false;
  if (!(live.inputs ?? []).includes("text") || !(live.outputs ?? []).includes("text")) return false;
  if (live.outputs !== undefined && live.outputs.length !== 1) return false;
  if (live.promptPerToken === undefined || live.completionPerToken === undefined) return false;
  if (live.created === undefined) return false;
  const age = (Date.parse(`${today}T00:00:00Z`) - live.created * 1000) / 86_400_000;
  return age >= 0 && age <= newWithinDays;
}

export function proposeCatalogue(
  current: { readonly catalogue: Catalogue; readonly lifecycle: Lifecycle },
  sources: ProposalSources,
): Proposal {
  const live = new Map(sources.openRouter.map((row) => [row.id, row]));
  const added: string[] = [];
  const retired: string[] = [];
  const priced: string[] = [];
  // A model past its lifecycle date retires, and its entry has done its job.
  const expired = current.lifecycle.models.filter((row) => row.retiresOn <= sources.today);
  const expiredKey = new Set(expired.map((row) => `${row.family}:${row.provider}:${row.id}`));
  const retire = <T extends { provider: string; id: string; deprecated: boolean }>(
    family: string,
    row: T,
    vanished: boolean,
  ): T => {
    if (row.deprecated) return row;
    if (!vanished && !expiredKey.has(`${family}:${row.provider}:${row.id}`)) return row;
    retired.push(row.id);
    return { ...row, deprecated: true };
  };
  const llm = current.catalogue.llm.map((row) => {
    if (row.provider !== "openrouter") return retire("llm", row, false);
    const found = live.get(row.id);
    // An empty listing is a failed read, never "everything retired".
    const vanished = live.size > 0 && found === undefined;
    const next = retire("llm", row, vanished);
    if (found === undefined || next.deprecated) return next;
    const fresh = refreshed(next, found, sources.today);
    if (fresh.priced) priced.push(row.id);
    return fresh.row;
  });
  const vendors = new Set(
    current.catalogue.llm
      .filter((row) => row.provider === "openrouter")
      .map((row) => row.id.split("/")[0] ?? ""),
  );
  const known = new Set(current.catalogue.llm.map((row) => `${row.provider}:${row.id}`));
  const room = Math.max(0, 300 - llm.length);
  const fresh = sources.openRouter
    .filter((row) => !known.has(`openrouter:${row.id}`) && isNew(row, vendors, sources.today))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, Math.min(newPerRun, room))
    .map((row) => proposedRow(row, sources.today));
  for (const row of fresh) added.push(row.id);
  const image = current.catalogue.image.map((row) => retire("image", row, false));
  const tts = current.catalogue.tts.map((row) => retire("tts", row, false));
  const changed = added.length + retired.length + priced.length > 0;
  const catalogue: Catalogue = {
    ...current.catalogue,
    updatedAt: changed ? sources.today : current.catalogue.updatedAt,
    llm: [...llm, ...fresh],
    image,
    tts,
  };
  // Metadata (context, output limit, thinking) can change without a price change.
  const metadataChanged = JSON.stringify(catalogue.llm) !== JSON.stringify(current.catalogue.llm);
  const lifecycle: Lifecycle = {
    ...current.lifecycle,
    models: current.lifecycle.models.filter((row) => row.retiresOn > sources.today),
  };
  return {
    catalogue: metadataChanged && !changed ? { ...catalogue, updatedAt: sources.today } : catalogue,
    lifecycle,
    added,
    retired,
    priced,
    changed: changed || metadataChanged || expired.length > 0,
  };
}

// The PR's title and the script's last line: "Models: 3 new, 1 retired, 2 price changes".
export function proposalSummary(proposal: Pick<Proposal, "added" | "retired" | "priced">): string {
  const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
  return `Models: ${count(proposal.added.length, "new", "new")}, ${count(proposal.retired.length, "retired", "retired")}, ${count(proposal.priced.length, "price change", "price changes")}`;
}

// OpenRouter's full listing, read loosely: a row that does not read cleanly is skipped.
export function readOpenRouterModels(value: unknown): readonly OpenRouterModel[] {
  const data =
    typeof value === "object" && value !== null ? (value as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) return [];
  const num = (raw: unknown): number | undefined => {
    const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : Number.NaN;
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const int = (raw: unknown): number | undefined => {
    const n = num(raw);
    return n !== undefined && Number.isInteger(n) && n > 0 ? n : undefined;
  };
  const strings = (raw: unknown): readonly string[] | undefined =>
    Array.isArray(raw) ? raw.filter((one): one is string => typeof one === "string") : undefined;
  const rows: OpenRouterModel[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || row.id === "" || row.id.length > 200) continue;
    const pricing = (
      typeof row.pricing === "object" && row.pricing !== null ? row.pricing : {}
    ) as Record<string, unknown>;
    const architecture = (
      typeof row.architecture === "object" && row.architecture !== null ? row.architecture : {}
    ) as Record<string, unknown>;
    const top = (
      typeof row.top_provider === "object" && row.top_provider !== null ? row.top_provider : {}
    ) as Record<string, unknown>;
    const params = strings(row.supported_parameters) ?? [];
    rows.push({
      id: row.id,
      ...(typeof row.name === "string" && row.name !== "" ? { name: row.name } : {}),
      ...(int(row.created) === undefined ? {} : { created: int(row.created) }),
      ...(int(row.context_length) === undefined ? {} : { contextLength: int(row.context_length) }),
      ...(int(top.max_completion_tokens) === undefined
        ? {}
        : { maxOutputTokens: int(top.max_completion_tokens) }),
      ...(num(pricing.prompt) === undefined ? {} : { promptPerToken: num(pricing.prompt) }),
      ...(num(pricing.completion) === undefined
        ? {}
        : { completionPerToken: num(pricing.completion) }),
      ...(num(pricing.input_cache_read) === undefined
        ? {}
        : { cachedPerToken: num(pricing.input_cache_read) }),
      ...(strings(architecture.input_modalities) === undefined
        ? {}
        : { inputs: strings(architecture.input_modalities) }),
      ...(strings(architecture.output_modalities) === undefined
        ? {}
        : { outputs: strings(architecture.output_modalities) }),
      reasoning: params.includes("reasoning"),
    });
  }
  return rows;
}

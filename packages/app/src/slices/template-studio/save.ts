import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import type { DraftReviewDeps } from "../play-drafts/model.js";
import { playDraftDocumentSchema } from "../play-drafts/schema.js";
import type { ProjectTemplate } from "../project-templates/model.js";
import { templateById } from "../project-templates/repo.js";
import { updateTemplate } from "../project-templates/service.js";
import { enqueueJob } from "./jobs.js";
import type { StudioRefusal } from "./model.js";
import { type QuoteDeps, quoteSave, type SampleQuote } from "./quote.js";
import { setSampleVersion } from "./repo.js";

// Save in the studio: the template's next version, and its sample queued at the price the
// person saw. A price that went up since, a price unknown that wasn't accepted, or a sample
// past today's budget is refused with the new quote, so nothing is ever spent unseen.

export const saveStudioSchema = z
  .object({
    mutationId: z.uuid(),
    baseVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(200),
    document: playDraftDocumentSchema,
    sample: z.enum(["make", "skip"]),
    // The high estimate the Save button showed; ignored when the sample is skipped.
    acknowledgedHigh: z.number().finite().min(0).max(10_000),
    // That some steps have no price, and the person accepts it.
    acknowledgedUnknown: z.boolean().optional(),
  })
  .strict()
  .readonly();
export type SaveStudioInput = z.infer<typeof saveStudioSchema>;

// A sample may cost a little more than the person saw before it waits: a quarter more and five
// cents. Above that, or with any price unknown that wasn't accepted, it waits to be asked again.
export function exceedsAcknowledged(high: number, acknowledged: number): boolean {
  return high > acknowledged * 1.25 + 0.05;
}

// Which template versions' unknown prices the person accepted on Save. In memory: after a
// restart a sample with unknown prices waits to be asked again, never the other way round.
export interface UnknownAcks {
  readonly accept: (templateId: string, version: number) => void;
  readonly accepted: (templateId: string, version: number) => boolean;
}

export function createUnknownAcks(): UnknownAcks {
  // ceiling: one entry per template version saved with unknown prices since boot.
  const accepted = new Set<string>();
  const key = (id: string, version: number) => `${id}@${String(version)}`;
  return {
    accept: (id, version) => void accepted.add(key(id, version)),
    accepted: (id, version) => accepted.has(key(id, version)),
  };
}

export interface SaveDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly review: DraftReviewDeps;
  readonly acks: UnknownAcks;
  readonly timeZone?: string | undefined;
}

export interface SavedStudio {
  readonly template: ProjectTemplate;
  readonly sample: "queued" | "skipped";
  readonly quote: SampleQuote | null;
  readonly replayed: boolean;
}

export type SaveResult =
  | { readonly ok: true; readonly value: SavedStudio }
  | {
      readonly ok: false;
      readonly reason: StudioRefusal;
      readonly message: string;
      readonly quote?: SampleQuote | undefined;
    };

const money = (value: number) => `$${value.toFixed(2)}`;

export async function saveStudio(deps: SaveDeps, id: string, raw: unknown): Promise<SaveResult> {
  const parsed = saveStudioSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid-input",
      message:
        "The studio sent a Save Slopify couldn't read. Reload the page and press Save again.",
    };
  const input = parsed.data;
  const head = templateById(deps.db, id);
  if (head === undefined)
    return {
      ok: false,
      reason: "not-found",
      message:
        "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
    };
  const update = {
    id,
    baseVersion: input.baseVersion,
    mutationId: input.mutationId,
    name: input.name,
    document: input.document,
  };
  // The same Save sent again (a retry after a lost answer) answers what it did the first time.
  const last = deps.db.prepare("SELECT mutation_id FROM project_templates WHERE id=?").get(id);
  if (last?.mutation_id === input.mutationId) {
    const replay = updateTemplate(deps.review, update);
    if (!replay.ok)
      return {
        ok: false,
        reason: "conflict",
        message:
          "This Save was already sent with different settings. Reload the studio to see what was saved.",
      };
    return {
      ok: true,
      value: {
        template: replay.value,
        sample: input.sample === "make" ? "queued" : "skipped",
        quote: null,
        replayed: true,
      },
    };
  }
  if (head.version !== input.baseVersion)
    return {
      ok: false,
      reason: "conflict",
      message: `This template changed since you opened it: it is now version ${String(head.version)}. Reload the studio to see the change, then make yours again.`,
    };
  let quote: SampleQuote | null = null;
  if (input.sample === "make") {
    const quoted = await quoteSave(deps satisfies QuoteDeps, id, input.document);
    if (!quoted.ok) return quoted;
    quote = quoted.value;
    if (quote.problem !== null)
      return {
        ok: false,
        reason: "invalid-input",
        message: `${quote.problem} Press Save without a sample to keep the change.`,
        quote,
      };
    if (exceedsAcknowledged(quote.high, input.acknowledgedHigh))
      return {
        ok: false,
        reason: "cost-changed",
        message: `The sample now costs about ${money(quote.high)}, more than the ${money(input.acknowledgedHigh)} you saw. Press Save again to accept the new price, or Save without a sample.`,
        quote,
      };
    if (quote.unknown > 0 && input.acknowledgedUnknown !== true)
      return {
        ok: false,
        reason: "cost-changed",
        message: `${String(quote.unknown)} ${quote.unknown === 1 ? "step of this sample has" : "steps of this sample have"} no known price. Tick that you accept unknown costs, then press Save again, or Save without a sample.`,
        quote,
      };
    if (!quote.fits)
      return {
        ok: false,
        reason: "over-budget",
        message: `This sample costs about ${money(quote.high)} and ${money(quote.budget.left)} of today's ${money(quote.budget.budget)} sample budget is left. Press Save without a sample, or raise the budget in Settings → Template studio.`,
        quote,
      };
  }
  const saved = updateTemplate(deps.review, update);
  if (!saved.ok)
    return {
      ok: false,
      reason:
        saved.reason === "not-found"
          ? "not-found"
          : saved.reason === "conflict"
            ? "conflict"
            : "invalid-input",
      message:
        saved.reason === "missing-prompt"
          ? "A prompt or intro/outro entry this template uses was deleted. Choose another in the template, then press Save again."
          : saved.reason === "conflict"
            ? "This template changed while you were editing. Reload the studio to see the latest, then make your change again."
            : "Some template settings are not valid, for example an image you supplied yourself. Check the template's settings and press Save again.",
    };
  const template = saved.value;
  const at = deps.clock.now().toISOString();
  if (quote !== null) {
    if (input.acknowledgedUnknown === true) deps.acks.accept(id, template.version);
    setSampleVersion(deps.db, id, template.version, {
      state: "queued",
      at,
      quotedHigh: quote.high,
      heldReason: null,
    });
  } else setSampleVersion(deps.db, id, template.version, { state: "skipped", at });
  enqueueJob(deps.db, {
    templateId: id,
    templateVersion: template.version,
    ackHigh: quote === null ? 0 : Math.max(input.acknowledgedHigh, 0),
    kind: quote === null ? "free" : "save",
    requestedAt: at,
  });
  return {
    ok: true,
    value: { template, sample: quote === null ? "skipped" : "queued", quote, replayed: false },
  };
}

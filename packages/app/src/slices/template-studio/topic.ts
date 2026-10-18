import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { templateById } from "../project-templates/repo.js";
import { enqueueJob } from "./jobs.js";
import type { SampleJobKind, TemplateSection } from "./model.js";
import { quoteSample, type SampleQuote } from "./quote.js";
import { sampleOf, setSampleVersion, upsertSample } from "./repo.js";
import { exceedsAcknowledged, type SaveDeps, type SaveResult } from "./save.js";
import { withDependents } from "./sections.js";
import { defaultSampleTopic, templateSchedules } from "./service.js";

// The sample's topic and its full script, changed in the studio. Either remakes paid samples,
// so it is priced first and refused, with the new quote, at a higher price, unaccepted unknown
// prices or past today's budget, exactly as Save is.

const price = {
  // The price the button showed for the change.
  acknowledgedHigh: z.number().finite().min(0).max(10_000),
  acknowledgedUnknown: z.boolean().optional(),
};

export const topicSchema = z
  .object({
    // A topic typed by the person, "next-queued" (the next topic a schedule of this template
    // has queued) or "fixed" (back to the topic every template's sample starts on).
    topic: z.string().trim().min(1).max(300),
    ...price,
  })
  .strict()
  .readonly();

export const fullScriptSchema = z
  .object({ fullScript: z.boolean(), ...price })
  .strict()
  .readonly();

export interface TopicChange {
  readonly topic: string;
  readonly topicSource: "fixed" | "queued";
  readonly fullScript: boolean;
  readonly quote: SampleQuote;
}

const money = (value: number) => `$${value.toFixed(2)}`;

// The topic a request names, with where it came from, or why there is none.
export function topicOf(
  deps: Pick<SaveDeps, "db">,
  templateId: string,
  asked: string,
):
  | { readonly ok: true; readonly topic: string; readonly source: "fixed" | "queued" }
  | { readonly ok: false; readonly message: string } {
  if (asked === "fixed") return { ok: true, topic: defaultSampleTopic(deps.db), source: "fixed" };
  if (asked === "next-queued") {
    const queued = templateSchedules(deps.db, templateId)
      .flatMap((schedule) => schedule.items)
      .find((item) => item.title.trim() !== "");
    return queued === undefined
      ? {
          ok: false,
          message:
            "No schedule of this template has a topic queued. Add topics in Calendar → Schedules, or type a topic for the sample.",
        }
      : { ok: true, topic: queued.title.trim(), source: "queued" };
  }
  return { ok: true, topic: asked, source: "fixed" };
}

async function change(
  deps: SaveDeps,
  id: string,
  next: {
    readonly topic: string;
    readonly source: "fixed" | "queued";
    readonly fullScript: boolean;
  },
  sections: readonly TemplateSection[] | "all",
  ack: { readonly acknowledgedHigh: number; readonly acknowledgedUnknown?: boolean | undefined },
  kind: SampleJobKind,
): Promise<SaveResult | { readonly ok: true; readonly value: TopicChange }> {
  const template = templateById(deps.db, id);
  if (template === undefined)
    return {
      ok: false,
      reason: "not-found",
      message:
        "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
    };
  const quoted = await quoteSample(deps, id, {
    topic: next.topic,
    fullScript: next.fullScript,
    sections,
  });
  if (!quoted.ok) return quoted;
  const quote = quoted.value;
  if (quote.problem !== null)
    return { ok: false, reason: "invalid-input", message: quote.problem, quote };
  if (exceedsAcknowledged(quote.high, ack.acknowledgedHigh))
    return {
      ok: false,
      reason: "cost-changed",
      message: `This change now costs about ${money(quote.high)}, more than the ${money(ack.acknowledgedHigh)} you saw. Press it again to accept the new price.`,
      quote,
    };
  if (quote.unknown > 0 && ack.acknowledgedUnknown !== true)
    return {
      ok: false,
      reason: "cost-changed",
      message: `${String(quote.unknown)} ${quote.unknown === 1 ? "step of this sample has" : "steps of this sample have"} no known price. Tick that you accept unknown costs, then press it again.`,
      quote,
    };
  if (!quote.fits)
    return {
      ok: false,
      reason: "over-budget",
      message: `This costs about ${money(quote.high)} and ${money(quote.budget.left)} of today's ${money(quote.budget.budget)} sample budget is left. Raise the budget in Settings → Template studio, or try again tomorrow.`,
      quote,
    };
  const at = deps.clock.now().toISOString();
  transact(deps.db, () => {
    const record = sampleOf(deps.db, id);
    // A template with no sample yet keeps the topic for its first one, under the id its
    // project will get.
    upsertSample(deps.db, id, {
      projectId: record?.projectId ?? deps.review.ids.next(),
      topic: next.topic,
      topicSource: next.source,
      fullScript: next.fullScript,
      at,
    });
    setSampleVersion(deps.db, id, template.version, {
      state: "queued",
      at,
      quotedHigh: quote.high,
      heldReason: null,
    });
    if (ack.acknowledgedUnknown === true) deps.acks.accept(id, template.version);
    enqueueJob(deps.db, {
      templateId: id,
      templateVersion: template.version,
      ackHigh: ack.acknowledgedHigh,
      kind,
      requestedAt: at,
    });
  });
  return {
    ok: true,
    value: { topic: next.topic, topicSource: next.source, fullScript: next.fullScript, quote },
  };
}

// PUT /:id/topic: a new topic remakes every section's sample.
export async function setSampleTopic(deps: SaveDeps, id: string, raw: unknown) {
  const parsed = topicSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false as const,
      reason: "invalid-input" as const,
      message: "Type a topic of 1 to 300 characters for the sample, then press Use topic.",
    };
  const named = topicOf(deps, id, parsed.data.topic);
  if (!named.ok)
    return { ok: false as const, reason: "invalid-input" as const, message: named.message };
  const record = sampleOf(deps.db, id);
  return change(
    deps,
    id,
    { topic: named.topic, source: named.source, fullScript: record?.fullScript ?? false },
    "all",
    parsed.data,
    "topic",
  );
}

// POST /:id/full-script: the whole script, or back to the outline and first chapter, remakes
// the script and what is made from it.
export async function setFullScript(deps: SaveDeps, id: string, raw: unknown) {
  const parsed = fullScriptSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false as const,
      reason: "invalid-input" as const,
      message: "The studio sent a request Slopify couldn't read. Reload the page and try again.",
    };
  const record = sampleOf(deps.db, id);
  return change(
    deps,
    id,
    {
      topic: record?.topic ?? defaultSampleTopic(deps.db),
      source: record?.topicSource ?? "fixed",
      fullScript: parsed.data.fullScript,
    },
    withDependents(["script"]),
    parsed.data,
    "full-script",
  );
}

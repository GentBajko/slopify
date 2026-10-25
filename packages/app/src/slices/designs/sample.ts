import { transact } from "../../kernel/db/tx.js";
import { budgetSentence } from "./budget.js";
import { missingValues } from "./fields.js";
import type { DesignResult } from "./model.js";
import { costChanged, costChangedMessage } from "./quote.js";
import { deleteRenders } from "./render.js";
import {
  oldSamples,
  queuedTemplates,
  type SampleRow,
  sampleReserved,
  sampleRow,
  sampleRowOfDesign,
  sampleSpentToday,
  startOfDay,
  writeSample,
} from "./sample-repo.js";
import type { DesignDocument } from "./schema.js";
import { designAffectedSections, sampleNeedsPicture } from "./sections.js";
import { designView } from "./service.js";
import { makeFromTemplate, quoteDocument, type TemplateMakeDeps } from "./template-make.js";
import { getTemplate, templateRevision } from "./templates.js";

// The design template editor's sample: a hidden design (`sample_of`) drawn with the template's
// sample values after each Save. Only the artwork is paid; a Save that changes only the text,
// formats or schedule redraws the same artwork for free, at once. One job per template: a newer
// Save replaces a queued one, and a picture being made is never stopped (the newer job waits
// for it). A paid sample is held, without spending, when it costs more than the person was
// shown (×1.25 + $0.05), when any price is unknown, or when it would take today's sample
// spending over the daily budget; Make sample then starts it on the person's say.

export interface SampleView {
  readonly state: SampleRow["state"];
  readonly version: number;
  readonly designId: string | null;
  readonly heldReason: string | null;
  readonly quotedHigh: number | null;
}

export interface DesignSampleDeps extends TemplateMakeDeps {
  readonly budget: () => number;
  // Whether samples may run on a CLI plan (Settings → Production defaults → Samples may use my CLI
  // plans); a Save's own sample of a picture on a plan waits while they may not.
  readonly plans: () => boolean;
  readonly timeZone: () => string;
}

export interface DesignSamples {
  readonly afterSave: (input: {
    readonly templateId: string;
    readonly version: number;
    readonly before: DesignDocument;
    readonly after: DesignDocument;
    readonly sample: "make" | "skip";
    readonly acknowledgedHigh: number;
  }) => DesignResult<SampleView | null>;
  // Make sample: the person starts a held, failed or missing sample at the price shown.
  readonly request: (
    templateId: string,
    version: number,
    acknowledgedHigh: number,
    acknowledgedUnknown?: boolean,
  ) => DesignResult<SampleView>;
  readonly state: (templateId: string) => SampleView | null;
  // A design changed: when it is a sample, its job may have finished and the next can start.
  readonly designChanged: (designId: string) => void;
  // At boot, after the design runner's own recovery: settle what stopped, start what waits.
  readonly recover: () => void;
}

const holdSlack = (ack: number): number => ack * 1.25 + 0.05;
const money = (value: number): string => `$${value.toFixed(2)}`;

function view(row: SampleRow): SampleView {
  return {
    state: row.state,
    version: row.version,
    designId: row.designId,
    heldReason: row.heldReason,
    quotedHigh: row.quotedHigh,
  };
}

export function createDesignSamples(deps: DesignSampleDeps): DesignSamples {
  const db = deps.service.db;
  const now = () => deps.service.clock.now();
  const at = () => now().toISOString();
  const emit = (templateId: string) =>
    deps.service.emit?.({ type: "design-template.sample", templateId });

  // A making sample whose picture landed or failed settles; true when it changed.
  const settle = (row: SampleRow): SampleRow => {
    if (row.state !== "making" || row.designId === null) return row;
    const design = designView(db, row.designId);
    const last = design?.steps.at(-1);
    if (last?.state === "making") return row;
    const next: SampleRow =
      last === undefined || last.state === "failed" || design === undefined
        ? {
            ...row,
            state: "failed",
            heldReason: last?.error ?? "The sample's picture was lost. Press Make sample.",
            updatedAt: at(),
          }
        : { ...row, state: "done", heldReason: null, updatedAt: at() };
    writeSample(db, next);
    return next;
  };

  const sweep = (templateId: string, keep: string | null): void => {
    for (const id of oldSamples(db, templateId, keep, startOfDay(now(), deps.timeZone()))) {
      db.prepare("DELETE FROM designs WHERE id=?").run(id);
      deleteRenders(deps.service.paths, id);
    }
  };

  // Why a sample a Save asked for waits instead of starting: a CLI plan samples may not use, a
  // price nobody knows, more than the person saw, or past today's budget counting what other
  // samples already queued or making will cost. Undefined when it may start.
  const holdOf = (
    templateId: string,
    quote: ReturnType<typeof quoteDocument>,
    acknowledgedHigh: number,
  ): string | null => {
    const spent = sampleSpentToday(db, now(), deps.timeZone()) + sampleReserved(db, templateId);
    const budget = deps.budget();
    return quote.rows.some((one) => one.onPlan === true) && !deps.plans()
      ? "Waiting: this sample's picture runs on your CLI plan, and samples may not use CLI plans. Turn on Samples may use my CLI plans in Settings → Production defaults, or press Make sample to make it anyway."
      : quote.unknown > 0
        ? "Waiting: the price of this sample's picture isn't known, so Slopify didn't make it. Press Make sample to make it anyway."
        : quote.high > holdSlack(acknowledgedHigh)
          ? `Waiting: this sample now costs about ${money(quote.high)}, more than the ${money(acknowledgedHigh)} you saw. Press Make sample (${money(quote.high)}) to make it.`
          : spent + quote.high > budget + 0.005
            ? budgetSentence(spent + quote.high, budget)
            : null;
  };

  // The templates whose queued sample the person started with Make sample: it starts on their
  // say, without the Save's holds. In memory: after a restart it is checked again.
  const pressed = new Set<string>();

  // Starts a queued job once the picture before it is done.
  const start = (templateId: string): void => {
    const row = sampleRow(db, templateId);
    if (row === undefined || row.state !== "queued") return;
    const current = row.designId === null ? undefined : designView(db, row.designId);
    if (current?.steps.some((step) => step.state === "making") === true) return;
    const revision = templateRevision(db, templateId, row.version);
    if (revision === undefined || getTemplate(db, templateId) === undefined) return;
    const asked = pressed.delete(templateId);
    // What a Save queued may have waited behind another picture: checked again as it starts.
    if (!asked) {
      const held = holdOf(
        templateId,
        quoteDocument(deps.catalogue(), revision.document),
        row.quotedHigh ?? 0,
      );
      if (held !== null) {
        writeSample(db, { ...row, state: "held", heldReason: held, updatedAt: at() });
        emit(templateId);
        return;
      }
    }
    const made = makeFromTemplate(
      deps,
      templateId,
      {
        mutationId: `sample-${deps.service.ids.next()}`,
        values: revision.document.samples,
        acknowledgedHigh: row.quotedHigh ?? 0,
        // Checked just above, or accepted on Make sample.
        acknowledgedUnknown: true,
        version: row.version,
      },
      { sampleOf: templateId },
    );
    if (!made.ok) {
      const held = made.reason === "cost-changed";
      const missing = missingValues(revision.document, revision.document.samples);
      writeSample(db, {
        ...row,
        state: held ? "held" : "failed",
        heldReason:
          made.reason === "missing-values"
            ? `The sample wasn't made: ${missing.map((name) => `{{${name}}}`).join(", ")} ${missing.length === 1 ? "has" : "have"} no sample value. Fill ${missing.length === 1 ? "it" : "them"} in under Text layout → Sample values, then press Make sample.`
            : made.message,
        updatedAt: at(),
      });
    } else {
      const making = made.value.steps.some((step) => step.state === "making");
      writeSample(db, {
        ...row,
        designId: made.value.id,
        state: making ? "making" : "done",
        heldReason: null,
        updatedAt: at(),
      });
      sweep(templateId, made.value.id);
    }
    emit(templateId);
  };

  const queue = (
    templateId: string,
    version: number,
    quote: number,
    held: string | null,
  ): SampleView => {
    const before = sampleRow(db, templateId);
    const row: SampleRow = {
      templateId,
      designId: before?.designId ?? null,
      version,
      state: held === null ? "queued" : "held",
      heldReason: held,
      quotedHigh: quote,
      updatedAt: at(),
    };
    // A picture being made keeps its state until it lands; the queued job waits behind it.
    writeSample(
      db,
      before?.state === "making" && held === null ? { ...row, state: "queued" } : row,
    );
    if (held === null) start(templateId);
    emit(templateId);
    return view(sampleRow(db, templateId) ?? row);
  };

  // Text-only changes: the sample keeps its artwork and takes the new settings at once.
  const redraw = (templateId: string, version: number, doc: DesignDocument): SampleView | null => {
    const row = sampleRow(db, templateId);
    if (row === undefined) return null;
    transact(db, () => {
      if (row.designId !== null)
        db.prepare(
          "UPDATE designs SET document_json=?, values_json=?, template_version=?, updated_at=? WHERE id=?",
        ).run(JSON.stringify(doc), JSON.stringify(doc.samples), version, at(), row.designId);
      writeSample(db, { ...row, version, updatedAt: at() });
    });
    if (row.designId !== null)
      deps.service.emit?.({ type: "design.changed", designId: row.designId });
    emit(templateId);
    return view(sampleRow(db, templateId) ?? row);
  };

  return {
    afterSave: (input) => {
      if (input.sample === "skip") return { ok: true, value: current(input.templateId) };
      const row = sampleRow(db, input.templateId);
      const affected = designAffectedSections(input.before, input.after);
      const hasArtwork = row?.designId != null && row.state !== "failed";
      if (hasArtwork && !sampleNeedsPicture(affected))
        return { ok: true, value: redraw(input.templateId, input.version, input.after) };
      const quote = quoteDocument(deps.catalogue(), input.after);
      const held = holdOf(input.templateId, quote, input.acknowledgedHigh);
      pressed.delete(input.templateId);
      return { ok: true, value: queue(input.templateId, input.version, quote.high, held) };
    },
    request: (templateId, version, acknowledgedHigh, acknowledgedUnknown = false) => {
      const revision = templateRevision(db, templateId, version);
      if (getTemplate(db, templateId) === undefined || revision === undefined)
        return {
          ok: false,
          reason: "not-found",
          message: "That version of the template doesn't exist. Reload the template.",
        };
      const row = sampleRow(db, templateId);
      if (row?.state === "making" && row.version === version) return { ok: true, value: view(row) };
      const quote = quoteDocument(deps.catalogue(), revision.document);
      // The person's own press: the price they saw is the limit, unknown prices included.
      if (costChanged(quote, acknowledgedHigh, acknowledgedUnknown))
        return {
          ok: false,
          reason: "cost-changed",
          message: costChangedMessage(quote, "the sample"),
          current: quote,
        };
      pressed.add(templateId);
      return { ok: true, value: queue(templateId, version, quote.high, null) };
    },
    state: (templateId) => current(templateId),
    designChanged: (designId) => {
      const row = sampleRowOfDesign(db, designId);
      if (row === undefined) return;
      const settled = settle(row);
      if (settled !== row) emit(row.templateId);
      start(row.templateId);
    },
    recover: () => {
      for (const id of db
        .prepare("SELECT template_id FROM design_template_samples WHERE state='making'")
        .all()
        .map((row) => String(row.template_id))) {
        const row = sampleRow(db, id);
        if (row !== undefined) settle(row);
      }
      for (const id of queuedTemplates(db)) start(id);
    },
  };

  function current(templateId: string): SampleView | null {
    const row = sampleRow(db, templateId);
    return row === undefined ? null : view(settle(row));
  }
}

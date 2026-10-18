import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { readinessIsUsable } from "../../kernel/ports/model.js";
import { lastAgentConnection } from "../agents/connection.js";
import { snapshotEntry, snapshotPrompt } from "../library/snapshot.js";
import { readNotificationUrl } from "../notifications/settings.js";
import { templateById } from "../project-templates/repo.js";
import { scheduleRows } from "../schedules/repo.js";
import type { ScheduleSummary } from "../schedules/schema.js";
import type { ProviderStatus } from "../settings/model.js";
import { readJsonSetting } from "../settings/repo.js";
import { type FreeCheckInput, freeChecks, type ScheduleFit } from "./checks.js";
import type { FreeSamples } from "./free.js";
import { gateOf, runnableVersion } from "./gate.js";
import { queuedJob, runningJob } from "./jobs.js";
import { fallbackSampleTopic, type StudioResult, type VersionGate } from "./model.js";
import { paidView } from "./paid-view.js";
import { gatesOf, sampleOf } from "./repo.js";
import { reviewsPath } from "./reviews-path.js";
import { monthlyCost, type RunPrice, upcomingRuns } from "./schedule-sample.js";
import type { StudioChecks, StudioView } from "./schema.js";
import { baseStatuses, madeStatuses, type SectionStatus } from "./status.js";

export interface StudioDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  // Where the sample project's files are, for its paid sample.
  readonly paths: Paths;
  readonly log: Log;
  // Whether each provider is set up now (`settings/readiness.ts` providerStatuses).
  readonly providerStatuses: () => Promise<readonly ProviderStatus[]>;
  // The samples made on this computer; without them every free sample says how to get them.
  readonly free: FreeSamples;
  // What each schedule's run costs, worked out by the sample job.
  readonly prices: PriceCache;
}

// One scheduled run's price, by the schedule's and the template's versions, so an edit to
// either is priced again. In memory: after a restart the next sample job prices it again.
export interface PriceCache {
  readonly get: (key: string) => RunPrice | undefined;
  readonly set: (key: string, price: RunPrice) => void;
}

export function createPriceCache(): PriceCache {
  // ceiling: one entry per schedule and template version seen since boot, a few bytes each.
  const prices = new Map<string, RunPrice>();
  return { get: (key) => prices.get(key), set: (key, price) => void prices.set(key, price) };
}

export function priceKey(
  schedule: Pick<ScheduleSummary, "id" | "version">,
  template: { readonly id: string; readonly version: number },
): string {
  return `${schedule.id}@${String(schedule.version)}:${template.id}@${String(template.version)}`;
}

export const sampleTopicKey = "templateStudio.sampleTopic.default";

export function defaultSampleTopic(db: DatabaseSync): string {
  const topic = readJsonSetting(db, sampleTopicKey, z.string(), fallbackSampleTopic).trim();
  return topic === "" ? fallbackSampleTopic : topic;
}

// The schedules that run a template now: not deleted, not finished.
export function templateSchedules(
  db: DatabaseSync,
  templateId: string,
): readonly ScheduleSummary[] {
  return scheduleRows(db).filter(
    (schedule) =>
      // A design schedule names a design template, never a project template.
      schedule.templateKind === "project" &&
      schedule.templateId === templateId &&
      schedule.deletedAt === null &&
      (schedule.status === "active" || schedule.status === "paused"),
  );
}

function fitOf(schedule: ScheduleSummary): ScheduleFit {
  const { cadence } = schedule;
  return {
    id: schedule.id,
    name: schedule.name,
    topicKeyword: schedule.topicKeyword,
    runDays:
      cadence.kind === "weekly"
        ? cadence.days
        : cadence.kind === "daily"
          ? [0, 1, 2, 3, 4, 5, 6]
          : [],
    releases: schedule.releases.map((release) => ({
      day: release.day,
      shorts: release.shorts.length,
    })),
  };
}

function bodiesOf(db: DatabaseSync, document: FreeCheckInput["document"]): readonly string[] {
  const snapshot = document.librarySnapshot;
  if (snapshot === undefined) return [];
  return [
    ...snapshot.prompts.map(
      (prompt) => snapshotPrompt(db, snapshot, prompt.kind, prompt.name)?.body ?? prompt.body,
    ),
    ...snapshot.entries.map(
      (entry) => snapshotEntry(db, snapshot, entry.category, entry.name)?.body ?? entry.body,
    ),
  ];
}

// The providers' readiness probes CLIs, which takes seconds: every caller in the window
// shares one lookup, and a failed one is never kept.
export function createReadinessCache(
  load: () => Promise<readonly ProviderStatus[]>,
  now: () => number = Date.now,
  ttlMs = 30_000,
): () => Promise<readonly ProviderStatus[]> {
  let held: { readonly at: number; readonly value: Promise<readonly ProviderStatus[]> } | undefined;
  return () => {
    const at = now();
    if (held !== undefined && at - held.at < ttlMs) return held.value;
    const value = load();
    const entry = { at, value };
    held = entry;
    value.catch(() => {
      if (held === entry) held = undefined;
    });
    return value;
  };
}

const missingTemplate =
  "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.";

// The studio page's content, answered without waiting for the providers' readiness: the
// checks that need it are read on their own (`getStudioChecks`).
export async function getStudio(deps: StudioDeps, id: string): Promise<StudioResult<StudioView>> {
  const template = templateById(deps.db, id);
  if (template === undefined) return { ok: false, reason: "not-found", message: missingTemplate };
  const gates = gatesOf(deps.db, id);
  const sample = sampleOf(deps.db, id);
  const schedules = templateSchedules(deps.db, id);
  const now = deps.clock.now();
  const cost = monthlyCost(schedules, pricesOf(deps, schedules, template), now);
  const running = runningJob(deps.db);
  const queued = queuedJob(deps.db, id);
  const free = deps.free.view(id, template.document, {
    running: running?.templateId === id && running.templateVersion === template.version,
    queued: queued !== undefined,
  });
  const paid = paidView(deps, id, template);
  return {
    ok: true,
    value: {
      template,
      gate: gateOf(gates, template.version),
      runnableVersion: runnableVersion(gates, template.version) ?? null,
      sample: {
        topic: sample?.topic ?? defaultSampleTopic(deps.db),
        topicSource: sample?.topicSource ?? "fixed",
        fullScript: sample?.fullScript ?? false,
      },
      sections: carriedSentences(
        baseStatuses(template.document, {
          ...madeStatuses(free, schedules.length, cost),
          ...paid.statuses,
        }),
        gates.find((gate) => gate.version === template.version),
      ),
      paid: paid.view,
      free,
      schedule: { runs: upcomingRuns(schedules, template.document, now), cost },
      reviews: reviewsPath(template.document),
    },
  };
}

// A version Slopify wrote itself keeps its gate, but what it changed has no sample yet: each
// stale section says who made the change.
function carriedSentences(
  sections: readonly SectionStatus[],
  gate: VersionGate | undefined,
): readonly SectionStatus[] {
  if (gate?.state !== "carried" || gate.carriedFrom === null) return sections;
  const why = `Slopify made version ${String(gate.version)} from version ${String(gate.carriedFrom)} itself (a retired model switched, or a new name on restore).`;
  return sections.map((section) =>
    section.state === "stale" ? { ...section, sentence: `${why} ${section.sentence}` } : section,
  );
}

function pricesOf(
  deps: StudioDeps,
  schedules: readonly ScheduleSummary[],
  template: { readonly id: string; readonly version: number },
): ReadonlyMap<string, RunPrice> {
  return new Map(
    schedules.flatMap((schedule) => {
      const price = deps.prices.get(priceKey(schedule, template));
      return price === undefined ? [] : [[schedule.id, price] as const];
    }),
  );
}

// The free checks a template passes before Mark ready. The providers' readiness is the slow
// part, so the page asks for these on their own.
export async function getStudioChecks(
  deps: StudioDeps,
  id: string,
): Promise<StudioResult<StudioChecks>> {
  const template = templateById(deps.db, id);
  if (template === undefined) return { ok: false, reason: "not-found", message: missingTemplate };
  const statuses = await deps.providerStatuses();
  const schedules = templateSchedules(deps.db, id);
  const now = deps.clock.now();
  const cost = monthlyCost(schedules, pricesOf(deps, schedules, template), now);
  return {
    ok: true,
    value: {
      version: template.version,
      checks: freeChecks({
        templateId: id,
        document: template.document,
        bodies: bodiesOf(deps.db, template.document),
        providers: new Map(
          statuses.map((status) => [
            status.id,
            { name: status.displayName, ready: readinessIsUsable(status.readiness) },
          ]),
        ),
        schedules: schedules.map(fitOf),
        monthlyCost: cost,
        notificationUrl: readNotificationUrl(deps.db) !== null,
        agentSeenAt: lastAgentConnection(deps.db),
        now,
      }),
    },
  };
}

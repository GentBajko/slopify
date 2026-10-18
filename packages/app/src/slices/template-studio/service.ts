import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { readinessIsUsable } from "../../kernel/ports/model.js";
import { lastAgentConnection } from "../agents/connection.js";
import { snapshotEntry, snapshotPrompt } from "../library/snapshot.js";
import { readNotificationUrl } from "../notifications/settings.js";
import { templateById } from "../project-templates/repo.js";
import { scheduleRows } from "../schedules/repo.js";
import type { ScheduleSummary } from "../schedules/schema.js";
import type { ProviderStatus } from "../settings/model.js";
import { readSetting } from "../settings/repo.js";
import { type FreeCheckInput, freeChecks, type ScheduleFit } from "./checks.js";
import { gateOf, runnableVersion } from "./gate.js";
import { fallbackSampleTopic, type StudioResult } from "./model.js";
import { gatesOf, sampleOf } from "./repo.js";
import type { StudioView } from "./schema.js";
import { baseStatuses } from "./status.js";

export interface StudioDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  // Whether each provider is set up now (`settings/readiness.ts` providerStatuses).
  readonly providerStatuses: () => Promise<readonly ProviderStatus[]>;
}

export const sampleTopicKey = "templateStudio.sampleTopic.default";

export function defaultSampleTopic(db: DatabaseSync): string {
  const raw = readSetting(db, sampleTopicKey);
  if (raw === undefined) return fallbackSampleTopic;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : fallbackSampleTopic;
  } catch {
    return fallbackSampleTopic;
  }
}

// The schedules that run a template now: not deleted, not finished.
export function templateSchedules(
  db: DatabaseSync,
  templateId: string,
): readonly ScheduleSummary[] {
  return scheduleRows(db).filter(
    (schedule) =>
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

export async function getStudio(deps: StudioDeps, id: string): Promise<StudioResult<StudioView>> {
  const template = templateById(deps.db, id);
  if (template === undefined)
    return {
      ok: false,
      reason: "not-found",
      message:
        "This template no longer exists; it may have been deleted. Go to Library → Templates to see your templates.",
    };
  const statuses = await deps.providerStatuses();
  const gates = gatesOf(deps.db, id);
  const sample = sampleOf(deps.db, id);
  const schedules = templateSchedules(deps.db, id);
  const checks = freeChecks({
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
    monthlyCost: null,
    notificationUrl: readNotificationUrl(deps.db) !== null,
    agentSeenAt: lastAgentConnection(deps.db),
    now: deps.clock.now(),
  });
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
      sections: baseStatuses(template.document),
      checks,
    },
  };
}

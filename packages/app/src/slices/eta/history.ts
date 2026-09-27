import type { DatabaseSync } from "node:sqlite";
import type { StageKind } from "../../kernel/pipeline.js";
import { type ModelChoices, modelKeyOf } from "./model.js";

// How long steps took in finished runs, read from the stage rows' own start and finish times.
// ceiling: the most recent finished steps are what the machine and the providers are like now;
// a few hundred rows is a fraction of a millisecond to read and plenty for a median.
const sampleLimit = 400;
// A model's own history is used once it has this many finished steps; below that, every
// step of the same kind is a fairer guess than one lucky or unlucky run.
const ownModelMinimum = 2;

interface Sample {
  readonly kind: StageKind;
  readonly model: string | undefined;
  readonly seconds: number;
  // The chapters, chunks or images the step counted, when it counted any.
  readonly units: number | undefined;
}

export interface StageHistory {
  // How long a step of `kind` on this run's provider and model usually takes in all, for a step
  // that will count `units` pieces when known; undefined with no finished step to go by.
  readonly typicalSeconds: (
    kind: StageKind,
    config: ModelChoices,
    units: number | null,
  ) => number | undefined;
}

export function readStageHistory(db: DatabaseSync): StageHistory {
  const samples: Sample[] = db
    .prepare(
      `SELECT s.kind, s.started_at, s.finished_at, s.progress_total, p.config FROM stages s
       JOIN projects p ON p.id=s.project_id
       WHERE s.state='done' AND s.started_at IS NOT NULL AND s.finished_at IS NOT NULL
       ORDER BY s.finished_at DESC LIMIT ?`,
    )
    .all(sampleLimit)
    .flatMap((row): Sample[] => {
      const seconds =
        (Date.parse(String(row.finished_at)) - Date.parse(String(row.started_at))) / 1000;
      if (!Number.isFinite(seconds) || seconds <= 0) return [];
      const kind = String(row.kind) as StageKind;
      const units =
        typeof row.progress_total === "number" && row.progress_total > 0
          ? row.progress_total
          : undefined;
      return [{ kind, model: modelKeyOf(kind, configOf(row.config)), seconds, units }];
    });
  return {
    typicalSeconds: (kind, config, units) => {
      const model = modelKeyOf(kind, config);
      const own = samples.filter((one) => one.kind === kind && one.model === model);
      const pool = own.length >= ownModelMinimum ? own : samples.filter((one) => one.kind === kind);
      if (pool.length === 0) return undefined;
      // A step with a count scales with it: eight images take longer than two.
      const counted = pool.filter((one) => one.units !== undefined);
      if (units !== null && units > 0 && counted.length > 0)
        return median(counted.map((one) => one.seconds / (one.units ?? 1))) * units;
      return median(pool.map((one) => one.seconds));
    },
  };
}

function configOf(value: unknown): ModelChoices {
  try {
    const parsed: unknown = JSON.parse(String(value));
    return typeof parsed === "object" && parsed !== null ? (parsed as ModelChoices) : {};
  } catch {
    return {};
  }
}

export function median(values: readonly number[]): number {
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

import type { DraftStartDeps } from "../play-drafts/model.js";
import type { ProjectTemplate } from "../project-templates/model.js";
import type { ScheduleRun, ScheduleSummary } from "./schema.js";

export type { ScheduleCreate, ScheduleRun, ScheduleSummary, ScheduleUpdate } from "./schema.js";
export interface ScheduleDeps extends DraftStartDeps {
  readonly template: (id: string, version: number) => ProjectTemplate | undefined;
}
export type ScheduleResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid-input"
        | "not-found"
        | "conflict"
        | "cancel-required"
        | "missing-template"
        | "unsupported-media"
        | "not-due"
        | "spend-limit"
        | "readiness";
    };

export interface ClaimedScheduleRun {
  readonly run: ScheduleRun;
  readonly schedule: ScheduleSummary;
}

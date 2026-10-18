import type { ScheduleTopicsEvent } from "../../kernel/events.js";
import type { StandaloneLlm } from "../../kernel/runner/standalone.js";
import type { DraftStartDeps } from "../play-drafts/model.js";
import type { ProjectTemplate } from "../project-templates/model.js";
import type { ScheduleRun, ScheduleSummary, ScheduleTemplateGate } from "./schema.js";

export type { ScheduleCreate, ScheduleRun, ScheduleSummary, ScheduleUpdate } from "./schema.js";

// One LLM answer, asked through `kernel/runner/standalone.ts` so it gets the stage calls'
// retries and lands on Home's run cost against the schedule. `main.ts` builds it from the
// provider registry; tests pass a fake.
export type TopicLlm = StandaloneLlm;

export interface ScheduleDeps extends DraftStartDeps {
  // The template version a schedule runs, previews and checks against. Without the template
  // studio's gate (tests, older wiring) it is the newest version; `main.ts` answers the newest
  // version that is legacy, marked ready or carried (`template-studio/schedule-gate.ts`).
  readonly template: (id: string) => ProjectTemplate | undefined;
  // Why a run of this template doesn't start (no version of it may run), or undefined.
  readonly notReady?: (templateId: string) => string | undefined;
  // The template's newest version, which may not be ready yet: a schedule may already name
  // the keywords it adds. Absent: the version `template` answers.
  readonly templateHead?: (id: string) => ProjectTemplate | undefined;
  // Which version each schedule's template runs, for the Schedules screen.
  readonly templateGate?: (templateId: string) => ScheduleTemplateGate | undefined;
  // Absent: topic generation records that no LLM is available instead of asking one.
  readonly topicLlm?: TopicLlm;
  // Told when a generation holds topics for approval.
  readonly topicsWaiting?: (event: ScheduleTopicsEvent) => void;
  // The "Generate topics now" button: the schedule runner starts one generation in the
  // background and tracks it for shutdown.
  readonly requestTopics?: (scheduleId: string) => void;
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
        | "readiness"
        | "queue-full"
        | "topic-not-found"
        | "busy"
        | "invalid-topics"
        | "not-ready";
      // The plain sentences for a refusal the reason alone can't explain: which topic and
      // keyword, and how to fix it.
      readonly message?: string;
    };

export interface ClaimedScheduleRun {
  readonly run: ScheduleRun;
  readonly schedule: ScheduleSummary;
}

import type { ScheduleTopicsEvent } from "../../kernel/events.js";
import type { Message, ThinkingMode } from "../../kernel/ports/llm.js";
import type { DraftStartDeps } from "../play-drafts/model.js";
import type { ProjectTemplate } from "../project-templates/model.js";
import type { ScheduleRun, ScheduleSummary } from "./schema.js";

export type { ScheduleCreate, ScheduleRun, ScheduleSummary, ScheduleUpdate } from "./schema.js";

// One LLM answer, as text. `main.ts` builds it from the provider registry; tests pass a fake.
export type TopicLlm = (call: {
  readonly provider: string;
  readonly model: string;
  readonly thinking?: ThinkingMode | undefined;
  readonly messages: readonly Message[];
  readonly signal: AbortSignal;
}) => Promise<string>;

export interface ScheduleDeps extends DraftStartDeps {
  readonly template: (id: string, version: number) => ProjectTemplate | undefined;
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
        | "busy";
    };

export interface ClaimedScheduleRun {
  readonly run: ScheduleRun;
  readonly schedule: ScheduleSummary;
}

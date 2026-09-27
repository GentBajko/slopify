import type { Fix } from "@app/slices/fixes/rules.js";
import { fixFor } from "@app/slices/fixes/rules.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import type { ReactElement } from "react";
import { Callout } from "@/components/kit/callout";
import { FixActions } from "@/fixes/fix-actions";

// A schedule's last topic generation failed: its own words, and the fix-it the same rules as a
// failed project step name (`slices/fixes/rules.ts`). Signing a CLI in ends with Check again
// asking for topics once more.

export function topicFailureFix(schedule: ScheduleSummary): Fix | undefined {
  const error = schedule.topics.error;
  if (error === null) return undefined;
  return fixFor({
    stage: "article",
    reason: error,
    provider: schedule.topicGeneration.llm?.provider,
  });
}

export function TopicFailure({
  schedule,
  title,
  retry,
  className,
}: {
  readonly schedule: ScheduleSummary;
  readonly title: string;
  // Asks for topics again (Generate topics now).
  readonly retry: { readonly run: () => void; readonly busy: boolean };
  readonly className?: string;
}): ReactElement | null {
  if (schedule.topics.error === null) return null;
  const fix = topicFailureFix(schedule);
  return (
    <Callout
      tone="danger"
      title={title}
      {...(className === undefined ? {} : { className })}
      {...(fix === undefined
        ? {}
        : {
            actions: <FixActions fix={fix} retry={retry} variant="secondary" size="small" />,
          })}
    >
      {schedule.topics.error}
    </Callout>
  );
}

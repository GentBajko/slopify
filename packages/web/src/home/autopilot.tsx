import type {
  AutopilotView,
  AutopilotWarning,
  BufferForecast,
  WarningFix,
} from "@app/slices/autopilot/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Fold } from "@/components/kit/fold";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { LoadingBlock, QueryState } from "@/components/kit/query-state";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { plural } from "@/lib/format";
import { autopilotKey, autopilotQuery, hideWarning } from "./api.js";

const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// "9 days of content ready · topics run out on Oct 30"; null with no runs ahead. Two facts: how
// far the videos made cover the runs ahead, and when a schedule has no topic left. When the
// videos cover every run there is and the topics run out, "60+ days" would count days with no
// run at all, so the line says every run has its video instead.
export function forecastLine(forecast: BufferForecast): string | null {
  if (forecast.daysAhead === null) return null;
  const dry = forecast.runsDryAt === null ? undefined : day.format(new Date(forecast.runsDryAt));
  if (forecast.coveredBeyondWindow && dry !== undefined)
    return `Every run has a video ready · topics run out on ${dry}`;
  const days = `${String(forecast.daysAhead)}${forecast.coveredBeyondWindow ? "+" : ""}`;
  return `${days} ${forecast.daysAhead === 1 && !forecast.coveredBeyondWindow ? "day" : "days"} of content ready${dry === undefined ? "" : ` · topics run out on ${dry}`}`;
}

function FixLink({ fix }: { readonly fix: WarningFix }): ReactElement {
  switch (fix.kind) {
    case "settings":
      return (
        <ButtonLink to="/settings" search={{ section: fix.section }} size="small">
          {fix.label}
        </ButtonLink>
      );
    case "schedule":
      return (
        <ButtonLink
          to="/schedules/$scheduleId"
          params={{ scheduleId: fix.scheduleId }}
          size="small"
        >
          {fix.label}
        </ButtonLink>
      );
    case "templates":
      return (
        <ButtonLink to="/templates" size="small">
          {fix.label}
        </ButtonLink>
      );
  }
}

function Warnings({
  warnings,
  channelId,
}: {
  readonly warnings: readonly AutopilotWarning[];
  readonly channelId: string | null;
}): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const hide = useMutation({
    mutationFn: (key: string) => hideWarning(api, key),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: autopilotKey });
    },
    onError: (error) =>
      notify(
        `Couldn't hide the warning: ${error.message}. Try Hide again; the warning stays until then.`,
        "error",
      ),
  });
  if (warnings.length === 0) return null;
  return (
    <List label={channelId === null ? "Autopilot warnings" : "Autopilot warnings for this channel"}>
      {warnings.map((warning) => (
        <ListRow
          key={warning.key}
          lead={
            warning.severity === "problem" ? (
              <Status tone="failed" className="shrink-0">
                Problem
              </Status>
            ) : (
              <Status tone="waiting" className="shrink-0">
                Warning
              </Status>
            )
          }
          // A warning is read whole: it wraps rather than ending in an ellipsis.
          title={<span className="whitespace-normal">{warning.text}</span>}
          actions={
            <>
              <FixLink fix={warning.fix} />
              <Button
                variant="quiet"
                size="small"
                disabled={hide.isPending}
                disabledReason="Hiding a warning"
                onClick={() => hide.mutate(warning.key)}
              >
                Hide
              </Button>
            </>
          }
        />
      ))}
    </List>
  );
}

// The steps that failed in the last seven days, folded, each linking to its project. What was
// made and spent is This week's to say, so it is not said twice; these are steps, not runs (a
// video made with a failed thumbnail is one), so the count is in steps. Nothing at all while
// no step failed.
function LastWeek({ weekly }: { readonly weekly: AutopilotView["weekly"] }): ReactElement | null {
  const failures = weekly.failed.length + weekly.failedMore;
  if (failures === 0) return null;
  return (
    <Fold
      remember="home.autopilot-week"
      summary="Failed in the last 7 days"
      state={plural(failures, "step", "steps")}
    >
      <ul className="mb-3 flex list-none flex-col gap-1 p-0 text-small">
        {weekly.failed.map((one) => (
          <li key={`${one.projectId}:${one.stage}`}>
            <TextLink to="/projects/$projectId" params={{ projectId: one.projectId }}>
              {one.title}
            </TextLink>
            <span className="text-ink-2">{` · ${one.stage}: ${one.reason}`}</span>
          </li>
        ))}
        {weekly.failedMore > 0 ? (
          <li className="text-ink-2">{`and ${String(weekly.failedMore)} more`}</li>
        ) : null}
      </ul>
    </Fold>
  );
}

// Inside Home's Coming up: how far ahead the content is, what may stop the schedules (each
// with its fix and Hide), and the steps that failed in the last seven days, folded.
export function Autopilot({ channelId }: { readonly channelId: string | null }): ReactElement {
  const { api } = useApp();
  const view = useQuery(autopilotQuery(api, channelId));
  return (
    <QueryState
      query={view}
      what="The autopilot check"
      compact
      loading={<LoadingBlock label="Checking how far ahead you are…" rows={1} rowClassName="h-6" />}
    >
      {(data) => {
        const line = forecastLine(data.forecast);
        return (
          <div className="mb-3 flex flex-col gap-2">
            {line === null ? null : <p className="m-0 font-medium">{line}</p>}
            <Warnings warnings={data.warnings} channelId={channelId} />
            <LastWeek weekly={data.weekly} />
          </div>
        );
      }}
    </QueryState>
  );
}

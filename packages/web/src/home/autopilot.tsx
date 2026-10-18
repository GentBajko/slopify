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
import { Lamp } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { usd } from "@/lib/format";
import { autopilotKey, autopilotQuery, hideWarning } from "./api.js";

const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// "9 days of content ready · the queue runs dry on Oct 30"; null with no runs ahead.
export function forecastLine(forecast: BufferForecast): string | null {
  const dry =
    forecast.runsDryAt === null
      ? ""
      : ` · the queue runs dry on ${day.format(new Date(forecast.runsDryAt))}`;
  if (forecast.daysAhead === null) return null;
  const days = `${String(forecast.daysAhead)}${forecast.coveredBeyondWindow ? "+" : ""}`;
  return `${days} ${forecast.daysAhead === 1 && !forecast.coveredBeyondWindow ? "day" : "days"} of content ready${dry}`;
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
          lead={<Lamp tone={warning.severity === "problem" ? "failed" : "waiting"} />}
          title={warning.text}
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

function LastWeek({ weekly }: { readonly weekly: AutopilotView["weekly"] }): ReactElement {
  const failures = weekly.failed.length + weekly.failedMore;
  return (
    <Fold
      remember="home.autopilot-week"
      summary={`Last 7 days · ${String(weekly.finished)} made · ${String(failures)} failed · ${usd(weekly.cost)}${weekly.unpriced > 0 ? ` + ${String(weekly.unpriced)} unpriced` : ""}`}
    >
      {weekly.failed.length === 0 ? (
        <p className="mb-3 text-small text-ink-2">No step failed.</p>
      ) : (
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
      )}
    </Fold>
  );
}

// Inside Home's Coming up: how far ahead the content is, what may stop the schedules (each
// with its fix and Hide), and the last seven days folded.
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

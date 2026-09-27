import type { HealthCheck, HealthReport, ProviderHealth } from "@app/slices/settings/health.js";
import type { ProviderId } from "@app/slices/settings/model.js";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { SectionHead } from "@/components/kit/section-head";
import { Status, type Tone } from "@/components/kit/status";
import { checkHealth } from "@/components/provider-upkeep-api";
import { cn } from "@/lib/utils";

const stateWords: Readonly<Record<ProviderHealth["state"], string>> = {
  ok: "Ready",
  warning: "Check",
  problem: "Needs fixing",
  unused: "Not set up",
};
const toneOf: Readonly<Record<ProviderHealth["state"], Tone>> = {
  ok: "done",
  warning: "waiting",
  problem: "failed",
  unused: "off",
};
const checkTone: Readonly<Record<HealthCheck["state"], string>> = {
  ok: "text-ink-2",
  warning: "text-waiting",
  problem: "text-danger",
  skipped: "text-ink-3",
};

export type HealthRun = UseMutationResult<HealthReport, Error, void>;

// Check all, held by whoever shows its button: Settings keeps it in the page header, so the
// report stays while the person moves between sections.
export function useProviderHealth(): HealthRun {
  const { api } = useApp();
  return useMutation({ mutationFn: () => checkHealth(api) });
}

// One provider checked again from its own row, after fixing what the report said. The answer
// replaces that row until the next Check all.
function useRecheck(checkedAt: string | undefined) {
  const { api } = useApp();
  const [rows, setRows] = useState<{
    readonly after?: string | undefined;
    readonly byId: ReadonlyMap<string, ProviderHealth>;
  }>({ byId: new Map() });
  const one = useMutation({
    mutationFn: (provider: ProviderId) => checkHealth(api, provider),
    onSuccess: (report) => {
      setRows((before) => {
        const byId = new Map(before.after === checkedAt ? before.byId : []);
        for (const row of report.providers) byId.set(row.id, row);
        return { after: checkedAt, byId };
      });
    },
  });
  const latest = (row: ProviderHealth): ProviderHealth =>
    rows.after === checkedAt ? (rows.byId.get(row.id) ?? row) : row;
  return { one, latest };
}

// Check all: every command-line tool found and signed in, every saved key accepted, every
// chosen model still offered. Providers neither set up nor chosen anywhere are summed up in
// one line rather than listed. Handed a `run`, the button is the caller's; alone, it shows
// its own.
export function ProviderHealthCheck({ run: given }: { readonly run?: HealthRun } = {}) {
  const own = useProviderHealth();
  const run = given ?? own;
  const report = run.data;
  const recheck = useRecheck(report?.checkedAt);
  const shown = report?.providers.filter((row) => row.state !== "unused").map(recheck.latest) ?? [];
  const unused = report?.providers.filter((row) => row.state === "unused") ?? [];
  return (
    <section aria-label="Health check">
      <SectionHead title="Health check" info="settings.health">
        {given === undefined ? (
          <Button
            disabled={run.isPending}
            onClick={() => {
              run.mutate();
            }}
          >
            {run.isPending ? "Checking…" : "Check all"}
          </Button>
        ) : undefined}
      </SectionHead>
      {run.error === null ? null : (
        <p role="alert" className="m-0 mb-2 text-body text-danger">
          The health check didn't finish: {run.error.message} Press Check all to try again.
        </p>
      )}
      {recheck.one.error === null ? null : (
        <p role="alert" className="m-0 mb-2 text-body text-danger">
          {`The check didn't finish: ${recheck.one.error.message} Press Check again on the provider to try again.`}
        </p>
      )}
      {report === undefined ? (
        <p className="m-0 text-small text-ink-2">
          {run.isPending ? "Checking every provider…" : "Not checked yet."}
        </p>
      ) : (
        <>
          <ul aria-label="Health by provider" className="sl-list m-0 list-none p-0">
            {shown.map((row) => (
              <li key={row.id} className="sl-row grid-cols-1 gap-1">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="sl-row__title">{row.displayName}</span>
                  <span className="flex items-center gap-2">
                    <Status tone={toneOf[row.state]}>{stateWords[row.state]}</Status>
                    <Button
                      variant="quiet"
                      size="small"
                      aria-label={`Check ${row.displayName} again`}
                      disabled={recheck.one.isPending}
                      onClick={() => {
                        recheck.one.mutate(row.id);
                      }}
                    >
                      {recheck.one.isPending && recheck.one.variables === row.id
                        ? "Checking…"
                        : "Check again"}
                    </Button>
                  </span>
                </div>
                <ul className="m-0 list-none space-y-1 p-0">
                  {row.checks.map((check) => (
                    <li key={check.label} className={cn("text-small", checkTone[check.state])}>
                      <span className="font-semibold">{check.label}:</span> {check.detail}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-3 text-small text-ink-2">
            {unused.length === 0
              ? `Checked at ${new Date(report.checkedAt).toLocaleTimeString()}.`
              : `Not set up and not used anywhere: ${unused.map((row) => row.displayName).join(", ")}.`}
          </p>
        </>
      )}
    </section>
  );
}

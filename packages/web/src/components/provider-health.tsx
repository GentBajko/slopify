import type { HealthCheck, HealthReport, ProviderHealth } from "@app/slices/settings/health.js";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
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

// Check all: every command-line tool found and signed in, every saved key accepted, every
// chosen model still offered. Providers neither set up nor chosen anywhere are summed up in
// one line rather than listed. Handed a `run`, the button is the caller's; alone, it shows
// its own.
export function ProviderHealthCheck({ run: given }: { readonly run?: HealthRun } = {}) {
  const own = useProviderHealth();
  const run = given ?? own;
  const report = run.data;
  const shown = report?.providers.filter((row) => row.state !== "unused") ?? [];
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
                  <Status tone={toneOf[row.state]}>{stateWords[row.state]}</Status>
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

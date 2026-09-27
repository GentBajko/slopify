import type { HealthCheck, ProviderHealth } from "@app/slices/settings/health.js";
import { useMutation } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { SectionHead } from "@/components/kit/section-head";
import { Lamp } from "@/components/lamp";
import { checkHealth } from "@/components/provider-upkeep-api";
import { Rail, RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const stateWords: Readonly<Record<ProviderHealth["state"], string>> = {
  ok: "Ready",
  warning: "Check",
  problem: "Needs fixing",
  unused: "Not set up",
};
const lampOf = (state: ProviderHealth["state"]) =>
  state === "ok" ? "done" : state === "problem" ? "failed" : "pending";
const checkTone: Readonly<Record<HealthCheck["state"], string>> = {
  ok: "text-ink2",
  warning: "text-amber",
  problem: "text-red",
  skipped: "text-ink3",
};

// Check all: every command-line tool found and signed in, every saved key accepted, every
// chosen model still offered. Providers neither set up nor chosen anywhere are summed up in
// one line rather than listed.
export function ProviderHealthCheck() {
  const { api } = useApp();
  const run = useMutation({ mutationFn: () => checkHealth(api) });
  const report = run.data;
  const shown = report?.providers.filter((row) => row.state !== "unused") ?? [];
  const unused = report?.providers.filter((row) => row.state === "unused") ?? [];
  return (
    <section aria-label="Health check" className="mt-8">
      <SectionHead
        title="Health check"
        info="Asks each command-line tool whether it is signed in, makes the cheapest harmless call each saved key allows (nothing is generated or billed), and checks that the models your templates, schedules, drafts and projects use are still offered."
      >
        <Button
          disabled={run.isPending}
          onClick={() => {
            run.mutate();
          }}
        >
          {run.isPending ? "Checking…" : "Check all"}
        </Button>
      </SectionHead>
      {run.error === null ? null : (
        <p role="alert" className="text-body text-red">
          {run.error.message}
        </p>
      )}
      {report === undefined ? (
        <p className="text-small text-ink2">
          {run.isPending ? "Checking every provider…" : "Not checked yet."}
        </p>
      ) : (
        <RailGroup>
          {shown.map((row) => (
            <Rail key={row.id} className="flex-col items-stretch gap-1">
              <div className="flex items-center gap-2">
                <Lamp state={lampOf(row.state)} />
                <span className="font-semibold">{row.displayName}</span>
                <span className="engraved ml-auto text-ink3">{stateWords[row.state]}</span>
              </div>
              <ul className="space-y-1">
                {row.checks.map((check) => (
                  <li key={check.label} className={cn("text-small", checkTone[check.state])}>
                    <span className="font-semibold">{check.label}:</span> {check.detail}
                  </li>
                ))}
              </ul>
            </Rail>
          ))}
          <Rail className="text-small text-ink2">
            {unused.length === 0
              ? `Checked at ${new Date(report.checkedAt).toLocaleTimeString()}.`
              : `Not set up and not used anywhere: ${unused.map((row) => row.displayName).join(", ")}.`}
          </Rail>
        </RailGroup>
      )}
    </section>
  );
}

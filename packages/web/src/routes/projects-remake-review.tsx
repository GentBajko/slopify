import type { ProjectListing } from "@app/slices/admission/model.js";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { counted } from "@/components/selection";
import { keys } from "@/queries";
import {
  costWords,
  planRemakes,
  type RemakeFailure,
  type RemakePlan,
  type RemakePlans,
  scopeLines,
  startRemakes,
  startsAtOnce,
} from "./projects-remake.js";

// The Projects selection bar's Remake outdated: it checks each selected project first, then
// opens one review with what each remakes, what each is estimated to cost, the total, and
// which projects are left out and why. One press starts them all; a project that fails to
// start says why on its row and can be tried again without starting the others twice.

const projectsWord = (count: number) => counted(count, "project", "projects");

export function RemakeOutdated({
  chosen,
  samples,
  busy,
  onDone,
}: {
  readonly chosen: readonly ProjectListing[];
  readonly samples: ReadonlySet<string>;
  // Another bulk action is working.
  readonly busy: boolean;
  readonly onDone: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [review, setReview] = useState<RemakePlans | undefined>();
  const [failures, setFailures] = useState<readonly RemakeFailure[]>([]);
  const [started, setStarted] = useState<ReadonlySet<string>>(new Set());
  const [unknownOk, setUnknownOk] = useState(false);
  const candidates = chosen.filter((one) => one.status !== "running" && !samples.has(one.id));

  const close = () => {
    if (starting) return;
    setReview(undefined);
    setFailures([]);
    setStarted(new Set());
    setUnknownOk(false);
  };

  const start = async (plans: readonly RemakePlan[], acknowledge: boolean) => {
    setStarting(true);
    try {
      const result = await startRemakes(api, plans, acknowledge);
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.projects }),
        ...result.started.map((plan) =>
          client.invalidateQueries({ queryKey: keys.project(plan.project.id) }),
        ),
      ]);
      const now = new Set([...started, ...result.started.map((plan) => plan.project.id)]);
      setStarted(now);
      setFailures(result.failed);
      if (result.started.length > 0)
        notify(
          `Started the remake of ${projectsWord(result.started.length)}. Each project's page shows its progress.`,
          "success",
        );
      return result;
    } finally {
      setStarting(false);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      const plans = await planRemakes(api, chosen, samples);
      if (startsAtOnce(plans)) {
        const result = await start(plans.plans, false);
        if (result.failed.length === 0) {
          onDone();
          close();
          return;
        }
      }
      setReview(plans);
    } finally {
      setChecking(false);
    }
  };

  const plans = review?.plans ?? [];
  const failedIds = new Set(failures.map((one) => one.plan.project.id));
  const pendingPlans = plans.filter((plan) => !started.has(plan.project.id));
  const unknown = pendingPlans.reduce((sum, plan) => sum + plan.preview.costs.unknown, 0);
  const holds = unknown > 0 && !unknownOk;
  const retry = failures.length > 0;
  const allStarted = plans.length > 0 && pendingPlans.length === 0;

  return (
    <>
      <Button
        size="small"
        disabled={busy || checking || candidates.length === 0}
        disabledReason={
          chosen.length === 0
            ? "Nothing is selected"
            : busy || checking
              ? "Working on it"
              : "Running and sample projects can't be remade from here"
        }
        onClick={() => void check()}
      >
        {checking ? `Checking ${projectsWord(chosen.length)}…` : "Remake outdated"}
      </Button>
      <Drawer
        open={review !== undefined}
        title={`Remake outdated: ${projectsWord(plans.length + (review?.skipped.length ?? 0))}`}
        onClose={() => {
          if (allStarted) onDone();
          close();
        }}
        footer={
          <>
            {allStarted ? (
              <Button
                variant="primary"
                onClick={() => {
                  onDone();
                  close();
                }}
              >
                Done
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={starting || pendingPlans.length === 0 || holds}
                disabledReason={
                  pendingPlans.length === 0
                    ? "None of the selected projects can be remade from here (reasons above)"
                    : holds
                      ? "Tick the box about unknown estimates first"
                      : "Starting…"
                }
                onClick={() => void start(pendingPlans, unknownOk)}
              >
                {starting
                  ? "Starting…"
                  : retry
                    ? `Try ${projectsWord(pendingPlans.length)} again`
                    : `Remake ${projectsWord(pendingPlans.length)}`}
              </Button>
            )}
            {allStarted ? null : (
              <Button disabled={starting} onClick={close}>
                Keep things as they are
              </Button>
            )}
          </>
        }
      >
        {review === undefined ? null : (
          <div className="flex flex-col gap-5">
            <section aria-label="What the remakes cost" className="flex flex-col gap-1">
              <p className="m-0 font-condensed text-title-2 tabular-nums">
                {pendingPlans.length === 0
                  ? "Nothing to start"
                  : costWords(pendingPlans.map((plan) => plan.preview.costs))}
              </p>
              <p className="m-0 text-small text-ink-2">
                {`${projectsWord(plans.length)} to remake${review.skipped.length === 0 ? "" : `, ${String(review.skipped.length)} left out`}. If a step fails, that project keeps its current version.`}
              </p>
            </section>
            {plans.length === 0 ? null : (
              <section aria-label="Projects to remake" className="flex flex-col gap-2">
                <SectionHead as="h3" size="small" title="To remake" />
                <List label="Projects to remake">
                  {plans.map((plan) => (
                    <PlanRow
                      key={plan.project.id}
                      plan={plan}
                      started={started.has(plan.project.id)}
                      failure={
                        failedIds.has(plan.project.id)
                          ? failures.find((one) => one.plan.project.id === plan.project.id)?.reason
                          : undefined
                      }
                    />
                  ))}
                </List>
              </section>
            )}
            {review.skipped.length === 0 ? null : (
              <section aria-label="Left out" className="flex flex-col gap-2">
                <SectionHead as="h3" size="small" title="Left out" />
                <List label="Left out">
                  {review.skipped.map((skip) => (
                    <ListRow
                      key={skip.project.id}
                      title={
                        <Link to="/projects/$projectId" params={{ projectId: skip.project.id }}>
                          {skip.project.title}
                        </Link>
                      }
                      meta={skip.reason}
                    />
                  ))}
                </List>
              </section>
            )}
            {unknown === 0 ? null : (
              <div className="flex items-start gap-1 text-small" {...helpScope}>
                <label className="flex items-start gap-2 text-small">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={starting}
                    checked={unknownOk}
                    onChange={(event) => setUnknownOk(event.target.checked)}
                  />
                  <span>{`I understand that ${String(unknown)} cost ${unknown === 1 ? "estimate is" : "estimates are"} unknown.`}</span>
                </label>
                <InfoTip id="project.rebuild.unknown-costs" className="-my-1" />
              </div>
            )}
            {failures.length === 0 ? null : (
              <StatusSlot tone="error">
                {`${projectsWord(failures.length)} didn't start (reasons on ${failures.length === 1 ? "its row" : "their rows"}). Press Try again, or open the project.`}
              </StatusSlot>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

function PlanRow({
  plan,
  started,
  failure,
}: {
  readonly plan: RemakePlan;
  readonly started: boolean;
  readonly failure: string | undefined;
}): ReactElement {
  return (
    <ListRow
      title={
        <Link to="/projects/$projectId" params={{ projectId: plan.project.id }}>
          {plan.project.title}
        </Link>
      }
      meta={started ? "Started" : costWords([plan.preview.costs])}
    >
      <ul className="m-0 flex flex-col gap-1 pl-5 text-small text-ink-2">
        {scopeLines(plan.preview).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {failure === undefined ? null : (
        <p role="alert" className="m-0 mt-1 text-small text-danger">
          {`Didn't start: ${failure}`}
        </p>
      )}
    </ListRow>
  );
}

import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useId, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { LoadingBlock, QueryState } from "@/components/kit/query-state";
import { SectionHead } from "@/components/kit/section-head";
import { Meter, Stat, Stats } from "@/components/kit/stats";
import { usd } from "@/lib/format";
import { startOfWeek, type WeekSummary, weekQuery } from "./api.js";

const money = { format: usd };

// "$9.40", with the unpriced calls said rather than read as free.
export function spentLabel(week: WeekSummary): string {
  const via = week.apiEquivalent === null ? "" : ` · ~${money.format(week.apiEquivalent)} via API`;
  const unknown =
    week.unpriced === 0
      ? ""
      : ` · ${String(week.unpriced)} ${week.unpriced === 1 ? "call" : "calls"} without a price`;
  return `spent${via}${unknown}`;
}

// Home's "This week": videos made since Monday, what they cost and would have cost through the
// API, and how much of each CLI plan's weekly allowance is used now.
export function ThisWeek({ channelId }: { readonly channelId: string | null }): ReactElement {
  const { api } = useApp();
  const since = startOfWeek().toISOString();
  const week = useQuery(weekQuery(api, since, channelId));
  // One channel's spend can be $0 while another's is not; the whole account's total sits
  // beside it so a filtered Home never reads as "nothing was spent".
  const everything = useQuery({ ...weekQuery(api, since, null), enabled: channelId !== null });
  const total = channelId === null ? undefined : everything.data;
  return (
    <QueryState
      query={week}
      what="This week's numbers"
      compact
      loading={<LoadingBlock label="Loading this week's numbers…" rows={1} rowClassName="h-20" />}
    >
      {(data) => (
        <Stats className="sl-home-stats">
          <Stat value={String(data.videos)} label="videos made" />
          <Stat
            value={money.format(data.cost)}
            label={`${spentLabel(data)}${
              total === undefined ? "" : ` · ${money.format(total.cost)} across all channels`
            }`}
          />
          {data.plans
            .filter((plan) => plan.weeklyPercent !== null)
            .map((plan) => {
              const percent = Math.round(plan.weeklyPercent ?? 0);
              return (
                <Stat
                  key={plan.account}
                  value={`${String(percent)}%`}
                  label={`weekly ${plan.name} limit`}
                >
                  <Meter
                    value={percent / 100}
                    label={`Weekly ${plan.name} limit`}
                    valueText={`${String(percent)}% of your weekly ${plan.name} limit`}
                    tone={percent >= 80 ? "waiting" : "accent"}
                  />
                </Stat>
              );
            })}
        </Stats>
      )}
    </QueryState>
  );
}

const openKey = "slopify.home.week-open";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(openKey) === "1";
  } catch {
    return false;
  }
}

// The week's totals on request: folded by default so the work stays first, and remembered in
// this browser once opened. Folded, nothing is fetched.
export function WeekTotals({
  channelId,
  channelName,
}: {
  readonly channelId: string | null;
  readonly channelName?: string | undefined;
}): ReactElement {
  const [open, setOpen] = useState(readOpen);
  const id = useId();
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(openKey, next ? "1" : "0");
    } catch {
      // A blocked storage only forgets the choice.
    }
  };
  return (
    <section aria-label="This week">
      <SectionHead
        title="This week"
        info="home.this-week"
        meta={
          channelId === null
            ? "Since Monday · every channel"
            : `Since Monday · ${channelName ?? "this channel"} only`
        }
      >
        <Button
          variant="quiet"
          size="small"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
        >
          {open ? "Hide totals" : "Show totals"}
        </Button>
      </SectionHead>
      <div id={id}>{open ? <ThisWeek channelId={channelId} /> : null}</div>
    </section>
  );
}

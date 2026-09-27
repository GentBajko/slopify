import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Meter, Stat, Stats } from "@/components/kit/stats";
import { startOfWeek, type WeekSummary, weekQuery } from "./api.js";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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
  if (week.error !== null)
    return (
      <p className="m-0 text-small text-danger">
        {`This week's numbers didn't load: ${week.error.message} Reload the page to try again.`}
      </p>
    );
  const data = week.data;
  return (
    <Stats className="sl-home-stats">
      <Stat value={data === undefined ? "—" : String(data.videos)} label="videos made" />
      <Stat
        value={data === undefined ? "—" : money.format(data.cost)}
        label={data === undefined ? "spent" : spentLabel(data)}
      />
      {(data?.plans ?? [])
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
  );
}

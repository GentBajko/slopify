import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { QueryState } from "@/components/kit/query-state";
import { SectionHead } from "@/components/kit/section-head";
import { Meter } from "@/components/kit/stats";
import { plural, usd } from "@/lib/format";
import { startOfWeek, type WeekSummary, weekQuery } from "./api.js";

// "$9.40 spent", with what it would have cost through the API and the unpriced calls said
// rather than read as free.
export function spentLabel(week: WeekSummary): string {
  const via = week.apiEquivalent === null ? "" : ` · ~${usd(week.apiEquivalent)} via API`;
  const unknown =
    week.unpriced === 0
      ? ""
      : ` · ${String(week.unpriced)} ${week.unpriced === 1 ? "call" : "calls"} without a price`;
  const studio = week.studioCost > 0 ? ` · ${usd(week.studioCost)} of it on template samples` : "";
  return `spent${via}${unknown}${studio}`;
}

// Nothing made, spent or measured this week: the section has nothing to say yet.
function quiet(week: WeekSummary): boolean {
  return (
    week.videos === 0 &&
    week.cost === 0 &&
    week.unpriced === 0 &&
    week.plans.every((plan) => plan.weeklyPercent === null)
  );
}

// Home's "This week", in the open: "3 videos · $9.40 spent · ~$31.00 via API", then how much of
// each CLI plan's weekly allowance is used. With a channel picked, the whole account's spend sits
// beside it, so a filtered Home never reads as "nothing was spent". Before anything was made it
// shows nothing.
export function ThisWeek({ channelId }: { readonly channelId: string | null }): ReactElement {
  const { api } = useApp();
  const since = startOfWeek().toISOString();
  const week = useQuery(weekQuery(api, since, channelId));
  const everything = useQuery({ ...weekQuery(api, since, null), enabled: channelId !== null });
  const total = channelId === null ? undefined : everything.data;
  return (
    <QueryState query={week} what="This week's numbers" compact loading={null}>
      {(data) =>
        quiet(data) ? null : (
          <section aria-label="This week" className="flex flex-col gap-2">
            <SectionHead title="This week" meta="Since Monday" />
            <p className="m-0 text-small text-ink-2 tabular-nums">
              <span className="font-semibold text-ink">
                {plural(data.videos, "video", "videos")}
              </span>
              {" · "}
              <span className="font-semibold text-ink">{usd(data.cost)}</span>
              {` ${spentLabel(data)}${total === undefined ? "" : ` · ${usd(total.cost)} across all channels`}`}
            </p>
            {data.plans
              .filter((plan) => plan.weeklyPercent !== null)
              .map((plan) => {
                const percent = Math.round(plan.weeklyPercent ?? 0);
                return (
                  <div key={plan.account} className="flex items-center gap-3 text-small">
                    <span className="w-40 shrink-0 text-ink-2">{`Weekly ${plan.name} limit`}</span>
                    <Meter
                      value={percent / 100}
                      label={`Weekly ${plan.name} limit`}
                      valueText={`${String(percent)}% of your weekly ${plan.name} limit`}
                      tone={percent >= 80 ? "waiting" : "accent"}
                      className="flex-1"
                    />
                    <span className="w-10 text-right tabular-nums">{`${String(percent)}%`}</span>
                  </div>
                );
              })}
          </section>
        )
      }
    </QueryState>
  );
}

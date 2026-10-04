import { planAccountOf } from "@app/kernel/ports/plan-limits.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { startOfWeek, weekQuery } from "@/home/api";

const at = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

// Before Start, how much of each CLI plan this setup uses is already gone: the plan's own last
// reading (taken during an earlier run), with when it was read. A plan that never reported one
// says nothing, rather than a guessed allowance.
interface Uses {
  readonly provider: string;
}

export function PlanAllowance({
  form,
}: {
  readonly form: { readonly llm: Uses; readonly audio: Uses; readonly images: Uses };
}): ReactElement | null {
  const { api } = useApp();
  const accounts = new Set(
    [form.llm.provider, form.audio.provider, form.images.provider].flatMap((provider) => {
      const account = planAccountOf(provider);
      return account === undefined ? [] : [account];
    }),
  );
  const week = useQuery({
    ...weekQuery(api, startOfWeek().toISOString(), null),
    enabled: accounts.size > 0,
  });
  const standing = (week.data?.plans ?? []).filter(
    (plan) =>
      accounts.has(plan.account) && (plan.weeklyPercent !== null || plan.fiveHourPercent !== null),
  );
  if (standing.length === 0) return null;
  return (
    <ul aria-label="Plan limits used" className="m-0 flex list-none flex-col gap-1 p-0 text-small">
      {standing.map((plan) => {
        const used = [
          plan.weeklyPercent === null
            ? undefined
            : `${String(Math.round(plan.weeklyPercent))}% of the weekly limit`,
          plan.fiveHourPercent === null
            ? undefined
            : `${String(Math.round(plan.fiveHourPercent))}% of the 5-hour limit`,
        ].filter((part) => part !== undefined);
        const resets =
          plan.weeklyResetsAt === null
            ? ""
            : ` The week resets ${day.format(new Date(plan.weeklyResetsAt))}.`;
        const high = (plan.weeklyPercent ?? 0) >= 80 || (plan.fiveHourPercent ?? 0) >= 80;
        return (
          <li key={plan.account} className={high ? "text-waiting" : "text-ink-2"}>
            {`${plan.name}: ${used.join(" and ")} used at its last reading (${at.format(new Date(plan.readAt))}).${resets}`}
          </li>
        );
      })}
    </ul>
  );
}

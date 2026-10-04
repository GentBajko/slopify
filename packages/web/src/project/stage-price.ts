import type { StageKind } from "@app/kernel/pipeline.js";
import type { RunCost } from "@app/slices/run-cost/panel.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { usd } from "@/lib/format";
import { runCostQuery } from "@/queries";

// What making something again is likely to cost, said only where this project's own recorded
// calls can say it honestly: a picture costs about what its pictures have cost so far, a
// local step costs nothing, and a CLI plan's call is $0 on the plan. With no record, or with
// calls that had no price, nothing is said and the remake's own review shows the estimate.
export interface Price {
  readonly text: string;
  // The most the person has been shown, in USD: a remake estimated at no more starts at once.
  readonly approvedUpTo: number;
}

const localStages: readonly StageKind[] = ["video", "document"];

export const money = usd;

// `count` pictures of this stage made again.
export function imagePrice(
  cost: RunCost | undefined,
  stage: StageKind,
  count: number,
): Price | undefined {
  const row = cost?.byStage.find((one) => one.stage === stage);
  if (row === undefined || row.images === 0 || row.unpriced > 0) return undefined;
  if (row.cost === 0 && row.apiEquivalent !== null)
    return { text: "$0 on your CLI plan; it uses some of the plan's limits.", approvedUpTo: 0 };
  // Rounded up to the cent shown, so the amount accepted is the amount read.
  const shown = Math.ceil((row.cost / row.images) * count * 100) / 100;
  return {
    text: `About ${money(shown)}, from what this project's pictures have cost so far.`,
    approvedUpTo: shown,
  };
}

export function rerunPrice(cost: RunCost | undefined, stage: StageKind): string | undefined {
  if (localStages.includes(stage)) return "No charge: it runs on this computer.";
  const row = cost?.byStage.find((one) => one.stage === stage);
  if (row === undefined || row.calls === 0 || row.unpriced > 0) return undefined;
  if (row.cost === 0 && row.apiEquivalent !== null)
    return "$0 on your CLI plan; it uses some of the plan's limits.";
  return `Earlier runs of this step in this project cost ${money(row.cost)} in all.`;
}

export function useRunCost(projectId: string | undefined): RunCost | undefined {
  const { api } = useApp();
  return useQuery({ ...runCostQuery(api, projectId ?? ""), enabled: projectId !== undefined }).data;
}

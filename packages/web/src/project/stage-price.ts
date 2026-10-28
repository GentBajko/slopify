import type { StageKind } from "@app/kernel/pipeline.js";
import type { RunCost } from "@app/slices/run-cost/panel.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { usd } from "@/lib/format";
import { runCostQuery } from "@/queries";

// What making something again costs, the line its dialog opens with: the paid calls it makes,
// then their price where this project's own recorded calls can say it honestly. A picture
// costs about what its pictures have cost so far, a local step costs nothing, and a CLI plan's
// call is $0 on the plan. With no record, with calls that had no price, or with a record of
// $0 from a service that is not a CLI plan, the line says the price isn't known: "$0" is
// never offered as a price.
export interface Price {
  // "1 paid image call, about $0.04."
  readonly text: string;
  // The most the person has been shown, in USD: a remake estimated at no more starts at once.
  readonly approvedUpTo: number;
}

const localStages: readonly StageKind[] = ["video", "document"];

const imageCalls = (count: number): string =>
  `${String(count)} paid image ${count === 1 ? "call" : "calls"}`;

// `count` pictures of this stage made again, when their price can be said.
export function imagePrice(
  cost: RunCost | undefined,
  stage: StageKind,
  count: number,
): Price | undefined {
  const row = cost?.byStage.find((one) => one.stage === stage);
  if (row === undefined || row.images === 0 || row.unpriced > 0) return undefined;
  if (row.cost === 0 && row.apiEquivalent !== null)
    return {
      text: `${String(count)} image ${count === 1 ? "call" : "calls"} on your CLI plan: $0, but it uses some of the plan's limits.`,
      approvedUpTo: 0,
    };
  // Rounded up to the cent shown, so the amount accepted is the amount read.
  const shown = Math.ceil((row.cost / row.images) * count * 100) / 100;
  if (shown === 0) return undefined;
  return { text: `${imageCalls(count)}, about ${usd(shown)}.`, approvedUpTo: shown };
}

// The first line of a dialog that draws `count` pictures again: the calls and their price,
// or that the price isn't known before they run.
export function imageCallsLine(price: Price | undefined, count: number): string {
  return price?.text ?? `${imageCalls(count)}; the image service's price isn't known in advance.`;
}

// What each stage's calls are, in a sentence: "Paid voice calls".
const callWords: Readonly<Record<StageKind, string>> = {
  research: "AI",
  article: "AI",
  audio: "voice",
  images: "image",
  thumbnail: "image",
  video: "",
  document: "",
};

// The first line of a dialog that makes a whole stage again.
export function rerunPrice(cost: RunCost | undefined, stage: StageKind): string {
  if (localStages.includes(stage)) return "No charge: it runs on this computer.";
  const paid = `Paid ${callWords[stage]} calls`;
  const row = cost?.byStage.find((one) => one.stage === stage);
  if (row !== undefined && row.calls > 0 && row.unpriced === 0) {
    if (row.cost === 0 && row.apiEquivalent !== null)
      return "$0 on your CLI plan; it uses some of the plan's limits.";
    if (row.cost > 0)
      return `${paid}; earlier runs of this step in this project cost ${usd(row.cost)} in all.`;
  }
  return `${paid}; the price isn't known in advance.`;
}

export function useRunCost(projectId: string | undefined): RunCost | undefined {
  const { api } = useApp();
  return useQuery({ ...runCostQuery(api, projectId ?? ""), enabled: projectId !== undefined }).data;
}

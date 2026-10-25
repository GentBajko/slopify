import { usd } from "@/lib/format";

// Settings → Production defaults' switch that lets samples run on a plan, by its name: the
// sentences of a sample that waits for it say what to turn on.
export const plansLabel = "Let samples use my Claude Code or Codex plan";

// Why a sample doesn't fit today (the server's `budgetWords`): a step runs on a CLI plan while
// samples may not use one, or it costs more dollars than are left of today's budget.
export interface BudgetQuote {
  readonly high: number;
  readonly usesPlan?: boolean | undefined;
  readonly budget: {
    readonly budget: number;
    readonly left: number;
    readonly plans?: boolean | undefined;
  };
}

export function heldByPlan(quote: BudgetQuote): boolean {
  return quote.usesPlan === true && quote.budget.plans !== true;
}

// The disabled button's short reason.
export function budgetReason(quote: BudgetQuote): string {
  return heldByPlan(quote)
    ? "Samples may not use your Claude Code or Codex plan"
    : "Today's sample budget can't cover it";
}

// The sentence before the link to Settings → Template studio, ending where the link goes.
export function budgetLead(quote: BudgetQuote, subject: string): string {
  return heldByPlan(quote)
    ? `${subject} runs on your Claude Code or Codex plan, and samples may not use it. Turn on ${plansLabel} in `
    : `${subject} costs about ${usd(quote.high)} and ${usd(quote.budget.left)} of today's ${usd(quote.budget.budget)} sample budget is left. Raise it in `;
}

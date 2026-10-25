import { usd } from "@/lib/format";

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
    ? "Samples may not use your CLI plan"
    : "Today's sample budget can't cover it";
}

// The sentence before the link to Settings → Production defaults, ending where the link goes.
export function budgetLead(quote: BudgetQuote, subject: string): string {
  return heldByPlan(quote)
    ? `${subject} runs on your CLI plan, and samples may not use CLI plans. Turn on Samples may use my CLI plans in `
    : `${subject} costs about ${usd(quote.high)} and ${usd(quote.budget.left)} of today's ${usd(quote.budget.budget)} sample budget is left. Raise it in `;
}

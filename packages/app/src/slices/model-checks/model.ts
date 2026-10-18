import type { ProviderFamily } from "../../kernel/ports/model.js";

// What Slopify knows about one model for the person's own key or CLI login. Only the pickers
// read it: a run never asks, so no standing ever changes what a run does.

// works: a check call or a real run succeeded. listed: the key's or CLI's live list names it.
// known: only Slopify's model list (models.yaml) names it. no-access: the provider said the
// account can't use it.
export const modelStandings = ["works", "listed", "known", "no-access"] as const;
export type ModelStanding = (typeof modelStandings)[number];

export const checkTriggers = ["manual", "key-added", "cli-added", "weekly", "run"] as const;
export type CheckTrigger = (typeof checkTriggers)[number];

// failed: the check could not tell (rate limit, network, the provider down); it keeps
// whatever was known before.
export const checkVerdicts = ["works", "no-access", "failed"] as const;
export type CheckVerdict = (typeof checkVerdicts)[number];

export const verdictSources = ["check", "run"] as const;
export type VerdictSource = (typeof verdictSources)[number];

// Settings → Models → Automatic checks. free: only checks that cost nothing or well under a
// tenth of a cent each; off: only Check models.
export const autoModes = ["free", "off"] as const;
export type AutoMode = (typeof autoModes)[number];

export const weeklyAtKey = "model-checks.weekly-at";
export const autoKey = "model-checks.auto";
export const baselineKey = "model-checks.baseline-done";

export interface ModelKey {
  readonly provider: string;
  readonly family: ProviderFamily;
  readonly model: string;
}

export interface ModelCheckRow extends ModelKey {
  // The key generation (keyed providers) or the provider id (CLIs) the row was learned with;
  // a new key starts over.
  readonly account: string;
  readonly listed: boolean | null;
  readonly listedAt: string | null;
  readonly verdict: CheckVerdict | null;
  readonly verdictSource: VerdictSource | null;
  // The provider's own words for the last verdict, redacted.
  readonly sentence: string | null;
  readonly checkedAt: string | null;
  // US dollars spent on checks of this model, all told.
  readonly cost: number;
  readonly firstWorksAt: string | null;
  readonly noticeSeen: boolean;
}

export interface Retiring {
  readonly on: string;
  readonly replacement: { readonly id: string; readonly name: string } | null;
}

export interface ModelStandingView {
  readonly standing: ModelStanding;
  readonly checkedAt: string | null;
  readonly sentence: string | null;
  readonly source: VerdictSource | null;
  readonly retiring?: Retiring | undefined;
}

// What one check costs: dollars at list price (null: the model list names no price), or a
// CLI plan's own allowance.
export interface CheckCost {
  readonly dollars: number | null;
  readonly planUsage: boolean;
}

export function keyOfModel(key: ModelKey): string {
  return `${key.family}:${key.provider}:${key.model}`;
}

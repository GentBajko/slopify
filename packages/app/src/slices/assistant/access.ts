import type { PricedWork } from "./cost.js";
import type { AssistantAsk, AssistantScreen } from "./model.js";
import type { ScreenNames } from "./prompt.js";

// What one running turn lets its MCP calls do: who they act for, what the person has open,
// and the turn's own asks. The endpoint finds it by the turn's token; once the turn ends the
// token answers nothing.
export interface AssistantTurnAccess {
  readonly sessionId: string;
  readonly turnId: string;
  readonly screen: AssistantScreen | undefined;
  readonly names: ScreenNames;
  // Opens the ask for this call (or finds the one still waiting) and tells the page. The
  // arguments are kept so that Allow runs exactly this call (`RunAllowedCall`).
  readonly ask: (call: {
    readonly tool: string;
    readonly argsHash: string;
    readonly text: string;
    readonly args?: Readonly<Record<string, unknown>> | undefined;
  }) => AssistantAsk;
  // Uses the person's Allow for this exact call, once.
  readonly grant: (call: { readonly tool: string; readonly argsHash: string }) => boolean;
  // The estimate a preview or review showed, for the start call that names its id.
  readonly rememberCost: (id: string, estimates: readonly PricedWork[]) => void;
  readonly costOf: (id: string) => readonly PricedWork[] | undefined;
}

export interface AssistantTurnTokens {
  readonly resolve: (token: string) => AssistantTurnAccess | undefined;
}

// The call an ask was for, run by Slopify itself once the person pressed Allow, as the
// assistant: the person's Allow is used for it, once. `text` is the tool's answer, or what
// refused it and how to fix that.
export interface AllowedCall {
  readonly sessionId: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}
export type RunAllowedCall = (
  call: AllowedCall,
) => Promise<{ readonly ok: boolean; readonly text: string }>;

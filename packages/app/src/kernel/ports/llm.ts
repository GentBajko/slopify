import type { ModelInfo } from "./model.js";

export const messageRoles = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof messageRoles)[number];

export interface Message {
  readonly role: MessageRole;
  readonly content: string;
}

// Null when the provider reports none: `reportsUsage` says whether to expect it, and the
// Usage page counts what arrived rather than estimating what did not.
export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmDelta {
  readonly type: "delta";
  readonly text: string;
}

export interface LlmDone {
  readonly type: "done";
  readonly usage: Usage | null;
  readonly finishReason: string | null;
}

export type LlmEvent = LlmDelta | LlmDone;

export interface LlmCapabilities {
  readonly streams: boolean;
  readonly reportsUsage: boolean;
  readonly webSearch: boolean;
}

export interface LlmCompletion {
  readonly model: string;
  readonly messages: readonly Message[];
  // A provider or model that cannot ground on the web refuses the whole stage rather than
  // answering from its own knowledge, so this is never quietly dropped.
  readonly webSearch?: boolean | undefined;
  readonly signal: AbortSignal;
}

export interface LlmPort {
  readonly id: string;
  readonly capabilities: LlmCapabilities;
  readonly models: () => Promise<readonly ModelInfo[]>;
  readonly complete: (req: LlmCompletion) => AsyncIterable<LlmEvent>;
}

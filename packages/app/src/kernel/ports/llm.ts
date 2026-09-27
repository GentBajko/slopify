import type { LlmDocument } from "./llm-documents.js";
import type { ModelInfo } from "./model.js";
import type { PlanLimitReading } from "./plan-limits.js";

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
  // Input tokens read from the provider's prompt cache, reported beside `inputTokens` (which
  // already counts them) where the provider says so.
  readonly cachedInputTokens?: number | undefined;
  // The model that actually answered, when the provider names one.
  readonly model?: string | undefined;
}

export interface LlmDelta {
  readonly type: "delta";
  readonly text: string;
}

export interface LlmDone {
  readonly type: "done";
  readonly usage: Usage | null;
  readonly finishReason: string | null;
  // A CLI's plan windows as it reported them around this call; absent when it reported none.
  readonly limits?: PlanLimitReading | undefined;
}

// Provider activity refreshes the idle deadline without exposing reasoning or tools.
export interface LlmActivity {
  readonly type: "activity";
}
export type LlmEvent = LlmDelta | LlmDone | LlmActivity;

export interface LlmCapabilities {
  readonly streams: boolean;
  readonly reportsUsage: boolean;
  readonly webSearch: boolean;
  // Whether `images` reach the model. Absent is no: the adapter refuses a request with images
  // rather than answering without having seen them.
  readonly images?: boolean | undefined;
}

// A picture the model is asked to look at: a local file (PNG, JPEG or WebP) and the name the
// prompt calls it by.
export interface LlmImage {
  readonly path: string;
  readonly name: string;
}

// "max" and "ultra" are the Codex CLI's two highest reasoning efforts (its model list reports
// them per model); the catalogue's models never offer them.
export const thinkingModes = ["off", "low", "medium", "high", "xhigh", "max", "ultra"] as const;
export type ThinkingMode = (typeof thinkingModes)[number];
export interface ThinkingConfig {
  readonly budget?: number | undefined;
  readonly level?: "minimal" | "low" | "medium" | "high" | undefined;
  readonly effort?:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max"
    | "ultra"
    | undefined;
}
export interface LlmCompletion {
  readonly documents?: readonly LlmDocument[] | undefined;
  readonly thinking?: ThinkingMode | undefined;
  readonly thinkingConfig?: ThinkingConfig | null | undefined;
  readonly model: string;
  readonly messages: readonly Message[];
  // A provider or model that cannot ground on the web refuses the whole stage rather than
  // answering from its own knowledge, so this is never quietly dropped.
  readonly webSearch?: boolean | undefined;
  readonly images?: readonly LlmImage[] | undefined;
  readonly signal: AbortSignal;
}

export interface LlmPort {
  readonly id: string;
  readonly capabilities: LlmCapabilities;
  readonly models: () => Promise<readonly ModelInfo[]>;
  readonly complete: (req: LlmCompletion) => AsyncIterable<LlmEvent>;
}

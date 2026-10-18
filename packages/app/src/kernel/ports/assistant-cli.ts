// The in-app assistant's turn on a CLI on this computer (`adapters/llm/assistant-cli.ts`). The
// slice hands in the turn's prompt and token and reads back what the chat shows; how the CLI
// is started, isolated and read stays in the adapter.

export const assistantCliIds = ["claude-code", "codex"] as const;
export type AssistantCliId = (typeof assistantCliIds)[number];

export interface AssistantCliTurn {
  readonly cli: AssistantCliId;
  // The command to run (the person's configured path, or the CLI's own name).
  readonly binary: string;
  // Slopify's `/mcp/assistant` on this server.
  readonly url: string;
  // The turn's token: handed to the CLI in its environment only.
  readonly token: string;
  readonly system: string;
  readonly prompt: string;
  readonly signal: AbortSignal;
}

export type AssistantStreamEvent =
  | { readonly type: "partial"; readonly text: string }
  // A finished piece of the answer.
  | { readonly type: "text"; readonly text: string }
  // A Slopify tool it called, without the server prefix.
  | { readonly type: "tool"; readonly name: string }
  // A tool from outside Slopify offered or used: the turn stops at once.
  | { readonly type: "foreign"; readonly name: string }
  | { readonly type: "done" }
  | { readonly type: "failed"; readonly message: string };

// Ends after "done" or "failed"; a run that stops without either ends with a "failed" that
// says why. Stops the CLI when the signal aborts or the reader stops reading.
export type RunAssistantCli = (turn: AssistantCliTurn) => AsyncIterable<AssistantStreamEvent>;

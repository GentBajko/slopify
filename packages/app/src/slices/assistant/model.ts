import { z } from "zod";

// The in-app assistant: a chat that runs on the person's own Claude Code or Codex with only
// Slopify's tools. Browser-safe: the web panel reads these types and builds its screen from
// the schema.

export const assistantClis = ["claude-code", "codex"] as const;
export type AssistantCli = (typeof assistantClis)[number];
export const assistantCliPreferences = ["auto", ...assistantClis] as const;
export type AssistantCliPreference = (typeof assistantCliPreferences)[number];

export const assistantCliNames: Readonly<Record<AssistantCli, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);

// ceiling: what the page says it shows is a hint for the model, not a command, so it is kept
// small: one path, the ids in it, and at most 20 selected rows with short labels.
export const assistantSelectionMax = 20;
export const assistantScreenSchema = z
  .object({
    path: z.string().min(1).max(300),
    projectId: id.optional(),
    scheduleId: id.optional(),
    channelId: id.optional(),
    templateId: id.optional(),
    section: z.string().min(1).max(80).optional(),
    selection: z
      .array(z.object({ kind: z.string().min(1).max(40), id, label: z.string().max(200) }).strict())
      .max(assistantSelectionMax)
      .optional(),
  })
  .strict();
export type AssistantScreen = z.infer<typeof assistantScreenSchema>;

export const assistantTextMax = 4000;

export const assistantRoles = ["person", "assistant", "tool", "ask", "error"] as const;
export type AssistantRole = (typeof assistantRoles)[number];

export interface AssistantMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly role: AssistantRole;
  readonly text: string;
  // A tool line's tool name, an ask's id, an error's kind.
  readonly meta: Readonly<Record<string, string>>;
  readonly createdAt: string;
}

export const askStates = ["asked", "allowed", "denied", "used", "expired"] as const;
export type AskState = (typeof askStates)[number];

export interface AssistantAsk {
  readonly id: string;
  readonly sessionId: string;
  readonly tool: string;
  readonly text: string;
  readonly state: AskState;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

export const turnStates = ["running", "done", "failed", "stopped"] as const;
export type TurnState = (typeof turnStates)[number];

export type AssistantEvent =
  | {
      readonly type: "assistant.delta";
      readonly sessionId: string;
      readonly turnId: string;
      readonly text: string;
    }
  | {
      readonly type: "assistant.tool";
      readonly sessionId: string;
      readonly turnId: string;
      readonly tool: string;
    }
  | {
      readonly type: "assistant.ask";
      readonly sessionId: string;
      readonly askId: string;
      readonly state: AskState;
    }
  | {
      readonly type: "assistant.turn";
      readonly sessionId: string;
      readonly turnId: string;
      readonly state: TurnState;
    };

// What a CLI on this computer answered when asked: installed, signed in, and anything else
// that keeps it from running (a Codex older than Slopify supports).
export interface AssistantCliState {
  readonly installed: boolean;
  readonly login: "signed-in" | "signed-out" | "unknown";
  readonly issue?: string | undefined;
}

export type AssistantCliStates = Readonly<Record<AssistantCli, AssistantCliState>>;

// Where the fix is: Settings → Keys & services, or the Install tutorial for the Docker copy.
export type AssistantFix =
  | { readonly kind: "settings"; readonly section: "providers"; readonly label: string }
  | { readonly kind: "tutorial"; readonly page: string; readonly label: string };

export type AssistantCliChoice =
  | { readonly ok: true; readonly cli: AssistantCli }
  | { readonly ok: false; readonly reason: string; readonly fix: AssistantFix };

const providersFix: AssistantFix = {
  kind: "settings",
  section: "providers",
  label: "Open Settings → Keys & services",
};

const signIn: Readonly<Record<AssistantCli, string>> = {
  "claude-code": "claude auth login",
  codex: "codex login",
};

function blocked(cli: AssistantCli, state: AssistantCliState): string | undefined {
  const name = assistantCliNames[cli];
  if (!state.installed)
    return `The assistant can't start: ${name} isn't installed on this computer. Install it, then set it up in Settings → Keys & services.`;
  if (state.issue !== undefined) return `The assistant can't start: ${state.issue}`;
  if (state.login === "signed-out")
    return `The assistant can't start: ${name} is signed out. Run "${signIn[cli]}" in a terminal, then send your message again.`;
  return undefined;
}

// The CLIs that could answer now, in Auto's order: the panel offers "Answer with" only when
// there are two to choose between.
export function readyClis(states: AssistantCliStates, container: boolean): readonly AssistantCli[] {
  if (container) return [];
  return assistantClis.filter((cli) => blocked(cli, states[cli]) === undefined);
}

// Auto takes Claude Code when it is ready, else Codex. A sign-in that couldn't be read is not
// a refusal: the CLI says so itself if it really is signed out.
export function assistantCliOf(
  states: AssistantCliStates,
  preference: AssistantCliPreference,
  container: boolean,
): AssistantCliChoice {
  if (container)
    return {
      ok: false,
      reason:
        "The assistant isn't available in the Docker version of Slopify: Claude Code and Codex run on your computer through the host helper, which can't hand them Slopify's tools safely. Install Slopify with npm on this computer to use the assistant.",
      fix: { kind: "tutorial", page: "Install", label: "Open the Install guide" },
    };
  if (preference !== "auto") {
    const reason = blocked(preference, states[preference]);
    return reason === undefined
      ? { ok: true, cli: preference }
      : { ok: false, reason, fix: providersFix };
  }
  for (const cli of assistantClis)
    if (blocked(cli, states[cli]) === undefined) return { ok: true, cli };
  return {
    ok: false,
    reason:
      "The assistant runs on Claude Code or Codex, and neither is ready on this computer. Set up Claude Code or Codex in Settings → Keys & services.",
    fix: providersFix,
  };
}

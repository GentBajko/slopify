import type { StageKind } from "../../kernel/pipeline.js";
import { providers } from "../settings/model.js";

// The fix-it buttons: every failure Slopify can name is mapped here, in one place, to the
// action that fixes it or walks the user through it. Pure, so the project page reads the
// same answer the tests pin; the web bundle imports this file.

export type SignInCli = "claude-code" | "codex" | "gemini";

export type Fix =
  // A CLI that is signed out: the command to run, then Check again.
  | {
      readonly kind: "sign-in";
      readonly label: string;
      readonly cli: SignInCli;
      readonly command: string;
    }
  // A key the provider rejected, or none saved.
  | { readonly kind: "provider-settings"; readonly label: string; readonly provider: string }
  // The disk the projects are on is full: the storage view says what can go.
  | { readonly kind: "free-space"; readonly label: string }
  // A content filter refused the prompt. An image step can reword it with the project's AI
  // model and draw again; any step can have its prompt edited.
  | { readonly kind: "refused"; readonly label: string; readonly soften: boolean }
  // The model is no longer offered.
  | { readonly kind: "switch-model"; readonly label: string };

export interface FailedStep {
  readonly stage: StageKind;
  // The provider error's kind (`ProviderErrorKind`) when the failure came from a provider.
  readonly kind?: string | undefined;
  readonly reason: string | null;
  // The provider the step used, as chosen in the project (`openrouter`, `codex-image`).
  readonly provider?: string | undefined;
}

const signIn: Readonly<Record<SignInCli, { readonly name: string; readonly command: string }>> = {
  "claude-code": { name: "Claude Code", command: "claude auth login" },
  codex: { name: "Codex", command: "codex login" },
  gemini: { name: "Gemini", command: "gemini" },
};

const signedOut =
  /not signed in|sign-in has expired|not logged in|run\s+"?(?:codex login|claude auth login)|authentication required/i;
const diskFull =
  /ENOSPC|no space left on device|disk (?:is )?full|not enough (?:free )?(?:disk )?space/i;
const refusedWords =
  /refused to make|content (?:rules|policy|filter)|safety (?:system|filter)|flagged|moderation/i;
const retiredModel =
  /\bunknown model\b|\bmodel\b[^\n]{0,80}?\b(?:not found|does not exist|retired|deprecated|decommissioned|no longer (?:available|supported)|is not available)/i;
const keyTrouble = /did not accept the API key|API key is saved|invalid api key|key may be wrong/i;

// Stages whose failed call draws an image from a prompt, which Soften and retry can reword.
const drawn: readonly StageKind[] = ["images", "thumbnail"];
// A short's still is drawn in the Video stage; its failure names it ("Short 4 image 6: …").
const shortStill = /^Short \d+ image \d+:/;

export function fixFor(step: FailedStep): Fix | undefined {
  const reason = step.reason ?? "";
  const cli = cliOf(step.provider, reason);
  if (cli !== undefined && (signedOut.test(reason) || step.kind === "auth"))
    return {
      kind: "sign-in",
      label: `Sign in to ${signIn[cli].name}`,
      cli,
      command: signIn[cli].command,
    };
  if (diskFull.test(reason)) return { kind: "free-space", label: "Free space" };
  if (step.kind === "refusal" || refusedWords.test(reason))
    return drawn.includes(step.stage) || (step.stage === "video" && shortStill.test(reason))
      ? { kind: "refused", label: "Soften and retry", soften: true }
      : { kind: "refused", label: "Edit the prompt", soften: false };
  if (retiredModel.test(reason)) return { kind: "switch-model", label: "Switch model" };
  if (step.kind === "auth" || step.kind === "missing_key" || keyTrouble.test(reason)) {
    const name = nameOf(step.provider);
    return {
      kind: "provider-settings",
      label:
        name === undefined ? "Open Settings → Providers" : `Open Settings → Providers → ${name}`,
      provider: step.provider ?? "",
    };
  }
  return undefined;
}

// The CLI a failure names: the project's own choice, or the one its sentence mentions.
function cliOf(provider: string | undefined, reason: string): SignInCli | undefined {
  if (provider === "claude-code" || provider === "gemini") return provider;
  if (provider === "codex" || provider === "codex-image") return "codex";
  if (/Codex CLI/.test(reason)) return "codex";
  if (/Claude Code CLI/.test(reason)) return "claude-code";
  if (/Gemini CLI/.test(reason)) return "gemini";
  return undefined;
}

function nameOf(provider: string | undefined): string | undefined {
  return providers.find((one) => one.id === provider)?.displayName;
}

// Which provider a stage's calls go to, from the project's choices.
export function stageProvider(
  config: {
    readonly llm?: { readonly provider: string } | undefined;
    readonly audio?: { readonly provider: string } | undefined;
    readonly images?: { readonly provider: string } | undefined;
  },
  stage: StageKind,
): string | undefined {
  switch (stage) {
    case "audio":
      return config.audio?.provider;
    case "images":
    case "thumbnail":
      return config.images?.provider;
    case "research":
    case "article":
      return config.llm?.provider;
    default:
      return undefined;
  }
}

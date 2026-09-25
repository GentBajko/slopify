import { type ProviderError, providerError } from "../../kernel/ports/model.js";
import { cliName } from "../explain.js";

export function cliLoginError(provider: string, text: string): ProviderError | undefined {
  if (/invalid api key/i.test(text)) return undefined;
  if (
    !/not logged in|please (?:run|use)\s+\/login|run\s+codex\s+login|authentication required|(?:access|refresh) token.*(?:expired|could not be refreshed|already used)/i.test(
      text,
    )
  )
    return undefined;
  const command =
    provider === "claude-code"
      ? "claude auth login"
      : provider === "gemini"
        ? "gemini"
        : "codex login";
  return providerError({
    kind: "missing_key",
    message: `The ${cliName(provider)} is not signed in, or its sign-in has expired. Open a terminal on the computer running the CLI, run "${command}" and sign in, then use Retry stage.`,
  });
}

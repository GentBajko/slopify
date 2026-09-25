// The sentences a failed provider call shows. Whatever an adapter throws becomes the stage's
// failure reason on the project page, read by someone who only wants the video, so each one
// says what failed, the likely cause and the next step, using the names on screen. The
// provider's own words stay in, quoted after the plain sentence, because they are often the
// only clue to a problem Slopify cannot see. Keys never reach here: callers redact first.

// A provider's error body can be a whole HTML page; the first few hundred characters say why.
const detailMax = 300;

export function missingKey(provider: string): string {
  return `No ${provider} API key is saved. Add one in Settings → Providers, then use Retry stage.`;
}

export interface HttpFailure {
  // As the user knows it: "Inworld", "fal.ai".
  readonly provider: string;
  readonly status: number;
  // The provider's own words, already redacted. Empty when it said nothing.
  readonly detail: string;
  // What was asked for, for a request the provider turned down: "narration for voice x".
  readonly subject?: string | undefined;
  // The next step when the provider rejected the request itself (a 4xx other than a key,
  // quota or credit problem).
  readonly fix?: string | undefined;
  // Replaces "error 401" when the status was translated from another scheme (gRPC codes).
  readonly label?: string | undefined;
  // The last step, for failures outside a stage: loading a model or voice list in Settings
  // says `refreshList` instead of "use Retry stage".
  readonly next?: string | undefined;
}

export const refreshList = "refresh the list";

export const checkChoice =
  "Check the provider and model chosen in the Providers section of Edit project, then use Retry stage.";

export function httpFailure(failure: HttpFailure): string {
  const { provider, status } = failure;
  const said = quoted(failure.label ?? `error ${String(status)}`, failure.detail);
  const next = failure.next ?? "use Retry stage";
  if (status === 401) {
    return `${provider} did not accept the API key${said}. The key may be wrong, expired or revoked: paste a current key in Settings → Providers, then ${next}.`;
  }
  if (status === 403) {
    return `${provider} refused access${said}. The API key may not be allowed to use this model, or the account needs attention: check your ${provider} account and the key in Settings → Providers, then ${next}.`;
  }
  if (status === 402) {
    return `${provider} says the account is out of credits${said}. Add credits on the ${provider} website, then ${next}.`;
  }
  if (status === 429) {
    return `${provider} is limiting requests${said}. Too many requests were sent at once or the plan's quota is used up: wait a few minutes or check your ${provider} usage and billing, then ${next}.`;
  }
  if (status >= 400 && status < 500) {
    return `${provider} rejected the ${failure.subject ?? "request"}${said}. ${failure.fix ?? (failure.next === undefined ? checkChoice : `Check the key in Settings → Providers, then ${next}.`)}`;
  }
  if (status >= 500) {
    return `${provider} had a problem on its side${said}. This is usually temporary: wait a few minutes, then ${next}.`;
  }
  return `${provider} answered with an unexpected error${said}. ${failure.next === undefined ? "Use Retry stage" : "Try again"}; if it keeps failing, use Download diagnostics in Settings and report it.`;
}

// A failure the provider reported inside an otherwise successful answer, with no status.
export function providerSaid(provider: string, what: string, detail: string, next: string): string {
  return `${provider} ${what}${quoted("", detail)}. ${next}`;
}

export function unreadable(provider: string): string {
  return `${provider} sent back an answer Slopify could not read. This is usually temporary: use Retry stage; if it keeps happening, use Download diagnostics in Settings and report it.`;
}

export function droppedStream(provider: string): string {
  return `The connection to ${provider} dropped before the answer was complete. Check your internet connection, then use Retry stage.`;
}

export function noAudio(provider: string): string {
  return `${provider} finished without sending any audio. Use Retry stage; if it keeps happening, check the voice in Settings → Voices.`;
}

export function noImage(provider: string): string {
  return `${provider} finished without sending an image. Use Retry stage; if it keeps happening, reword the image prompt in the Images section of Edit project or choose another image model in its Providers section.`;
}

export function refusedImage(provider: string, detail: string): string {
  return `${provider} refused to make this image under its content rules${quoted("", detail)}. Reword the image prompt in the Images section of Edit project, or choose another image provider in its Providers section.`;
}

// A narration request the provider turned down is most often a voice that no longer exists
// or a part longer than the model takes.
export function voiceFix(voiceId: string): string {
  return `Check that voice "${voiceId}" still exists in Settings → Voices and that each narration part fits the model's length limit (Chunking, in the Providers section of Edit project), then use Retry stage.`;
}

export function internalError(what: string): string {
  return `Slopify hit an internal error (${what}). Use Retry stage; if it happens again, use Download diagnostics in Settings and report it.`;
}

const cliNames: Readonly<Record<string, string>> = {
  claude: "Claude Code CLI",
  "claude-code": "Claude Code CLI",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
};

// A configured path (`/opt/bin/claude`, `C:\\tools\\codex.cmd`) still names the CLI the user chose.
export function cliName(binary: string): string {
  const base = commandOf(binary);
  return cliNames[base] ?? `"${base}" CLI`;
}

// What to type in a terminal to run it.
export function commandOf(binary: string): string {
  return (binary.split(/[\\/]/).at(-1) ?? binary).replace(/\.(?:cmd|exe|bat|js|mjs)$/i, "");
}

// An error the CLI itself reported, in its own words, with the step that most often fixes it.
export function cliReported(binary: string, detail: string, next: string): string {
  return `The ${cliName(binary)} reported an error${quoted("", detail)}. ${next}`;
}

export function cliCheck(binary: string): string {
  return `Use Retry stage; if it keeps failing, run ${commandOf(binary)} in a terminal to check it works and is signed in, or choose another model in the Providers section of Edit project.`;
}

// ` (error 401: "Unauthorized")`, ` (error 401)`, ` ("Unauthorized")`, or nothing.
export function quoted(label: string, detail: string): string {
  const text = detail.trim();
  const clipped = text.length > detailMax ? `${text.slice(0, detailMax)}…` : text;
  if (clipped === "") return label === "" ? "" : ` (${label})`;
  return label === "" ? ` ("${clipped}")` : ` (${label}: "${clipped}")`;
}

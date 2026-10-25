import { readinessIsUsable } from "@app/kernel/ports/model.js";
import type { StageSource } from "@app/slices/admission/model.js";
import type { FieldError } from "@app/slices/admission/rules.js";
import type { Entry } from "@app/slices/library/model.js";
import type { ProviderFamily, ProviderStatus } from "@app/slices/settings/model.js";
import { usesAnimation, type VideoEditSettings } from "@app/slices/video/edit-settings.js";
import { type Blocker, fixOf, hintOf, readingRank } from "./admission";
import { rowOf, type SetupRowId, setupRows } from "./setup-rows";
import { type PlayFormState, shortsOn } from "./state";

// Everything that stops the Make button, once: the setup rows show each in red, the hint under
// the button names the first, and the summary drawer lists them all, so the three always agree
// on what is left and how much.
export interface SetupProblem {
  // The row that holds it, "topic" for the field at the top, or undefined for one no row
  // holds (an upload still copying, a rule the form has no place for).
  readonly row: SetupRowId | "topic" | undefined;
  readonly field: string;
  // What the row says in red: the next thing to do, "Pick a voice".
  readonly text: string;
  // What the hint under the Make button says: "Pick a voice first".
  readonly hint: string;
}

interface RequiredProvider {
  readonly field: string;
  readonly family: ProviderFamily;
  readonly provider: string;
}

// What a setup says about the services it calls: a Create form or a saved draft's.
interface ProviderForm {
  readonly sources: {
    readonly article: StageSource;
    readonly audio: StageSource;
    readonly images: StageSource;
    readonly thumbnail: StageSource;
    readonly video: StageSource;
  };
  readonly llm: { readonly provider: string };
  readonly audio: { readonly provider: string };
  readonly images: { readonly provider: string };
  readonly intro: string;
  readonly outro: string;
  readonly youtubeDescription?: boolean | undefined;
  readonly shorts?: { readonly enabled: boolean } | undefined;
  readonly videoEdit?: VideoEditSettings | undefined;
}

// The writer, the voice service and the image service this setup calls.
export function requiredProviders(
  form: ProviderForm,
  entries: readonly Entry[],
): readonly RequiredProvider[] {
  const generatedAudio = form.sources.audio === "generate";
  const generatedThumbnail = ["from_prompt", "prompt_by_llm"].includes(form.sources.thumbnail);
  const generatedText =
    form.sources.article === "generate" ||
    form.sources.thumbnail === "prompt_by_llm" ||
    (form.youtubeDescription === true && form.sources.audio !== "off") ||
    shortsOn(form) ||
    (generatedAudio &&
      (["intro", "outro"] as const).some((kind) =>
        entries.some(
          (entry) => entry.category === kind && entry.name === form[kind] && entry.mode === "llm",
        ),
      ));
  const images =
    form.sources.images === "generate" ||
    generatedThumbnail ||
    shortsOn(form) ||
    usesAnimation({ sources: form.sources, videoEdit: form.videoEdit });
  return [
    ...(generatedText
      ? [{ field: "llm.provider", family: "llm" as const, provider: form.llm.provider }]
      : []),
    ...(generatedAudio
      ? [{ field: "audio.provider", family: "tts" as const, provider: form.audio.provider }]
      : []),
    ...(images
      ? [{ field: "images.provider", family: "image" as const, provider: form.images.provider }]
      : []),
  ];
}

// Whether a service answers: a key saved, a command-line tool installed and signed in, or the
// computer's own voice found. Not knowing (the list has not arrived) is not a problem.
export function readiness(provider: ProviderStatus): {
  readonly ok: boolean;
  readonly text: string;
} {
  if (provider.readiness.kind === "cli")
    return readinessIsUsable(provider.readiness)
      ? { ok: true, text: "Ready" }
      : {
          ok: false,
          text:
            provider.readiness.issue ?? `${provider.displayName} isn't installed on this computer`,
        };
  if (provider.readiness.kind === "local")
    return provider.readiness.available
      ? { ok: true, text: "Ready" }
      : { ok: false, text: speechIssue(provider.readiness.issue) };
  return provider.readiness.hasKey
    ? { ok: true, text: "Key saved" }
    : { ok: false, text: `${provider.displayName} has no key yet` };
}

// What is wrong with the computer's own voice, in its first sentence: the server's sentence goes
// on to the commands that install a speech program, which the Narration row lists apart.
export function speechIssue(issue: string | undefined): string {
  const first = issue
    ?.split(/(?<=\.)\s+/)[0]
    ?.trim()
    .replace(/\.$/, "");
  return first === undefined || first === ""
    ? "No speech program was found on this computer"
    : first;
}

const familyWords: Readonly<Record<ProviderFamily, string>> = {
  llm: "writing service",
  tts: "voice service",
  image: "image service",
};

const article = (word: string): string => (/^[aeiou]/i.test(word) ? "an" : "a");

// The picked services that will not answer, as problems: "OpenAI has no key yet".
export function readinessProblems(
  form: ProviderForm,
  entries: readonly Entry[],
  providers: readonly ProviderStatus[],
  llmRow: SetupRowId,
): readonly SetupProblem[] {
  return requiredProviders(form, entries).flatMap((choice) => {
    if (choice.provider === "") return [];
    const provider = providers.find(
      (one) => one.id === choice.provider && one.family === choice.family,
    );
    if (provider === undefined) return [];
    const check = readiness(provider);
    if (check.ok) return [];
    const name = provider.displayName;
    const other = `or pick another ${familyWords[choice.family]}`;
    const [fix, how] =
      provider.readiness.kind === "keyed"
        ? [`Add ${article(name)} ${name} key`, "add one in Settings"]
        : provider.readiness.kind === "cli"
          ? [`Set up ${name}`, "set it up"]
          : ["Install a speech program", "install one"];
    return [
      {
        row: choice.family === "llm" ? llmRow : choice.family === "tts" ? "narration" : "images",
        field: choice.field,
        text: `${check.text}: ${how}, ${other}.`,
        hint: `${fix} first`,
      },
    ];
  });
}

// One list, in the order a person meets them: the topic at the top, then the rows top to
// bottom, then anything no row holds. Each row counts once, with its first problem.
export function setupProblems({
  form,
  errors,
  refused,
  topics,
  llmRow,
  blocker,
  readinessFirst = [],
}: {
  readonly form: PlayFormState;
  readonly errors: readonly FieldError[];
  // What the server refused: its own sentence is kept, word for word.
  readonly refused: readonly FieldError[];
  readonly topics: readonly string[];
  readonly llmRow: SetupRowId;
  // An upload still copying or one that failed: it stops the button before anything else.
  readonly blocker?: Blocker | undefined;
  readonly readinessFirst?: readonly SetupProblem[];
}): readonly SetupProblem[] {
  const topicField = (field: string): boolean =>
    (field === "title" && topics.length === 0) ||
    topics.some((topic) => field === `values.${topic}`);
  // The server's own sentence is kept when it says something the form does not know ("That
  // article prompt was deleted."); for a rule the form checks too, the form's words.
  const placed = (error: FieldError): SetupProblem => {
    const server =
      refused.includes(error) &&
      !errors.some(
        (other) => other !== error && !refused.includes(other) && other.field === error.field,
      );
    return {
      row: topicField(error.field) ? "topic" : rowOf(error.field, llmRow),
      field: error.field,
      text: server ? error.message : (fixOf(form, error) ?? error.message),
      hint: server ? error.message : hintOf(form, error),
    };
  };
  const uploads =
    blocker !== undefined && isUpload(blocker.field)
      ? [{ row: undefined, field: blocker.field, text: blocker.hint, hint: blocker.hint }]
      : [];
  // Within a row, what the server refused comes first: it has the last word on the draft.
  const server = (error: FieldError): number => (refused.includes(error) ? 0 : 1);
  const ranked = [...errors].sort(
    (left, right) =>
      server(left) - server(right) || readingRank(left.field) - readingRank(right.field),
  );
  const all = [...readinessFirst, ...ranked.map(placed)];
  const order: readonly (SetupRowId | "topic")[] = ["topic", ...setupRows.map((row) => row.id)];
  const rows = order.flatMap((row) => {
    const found = all.find((problem) => problem.row === row);
    return found === undefined ? [] : [found];
  });
  return [...uploads, ...rows, ...all.filter((problem) => problem.row === undefined)];
}

function isUpload(field: string): boolean {
  return field === "provided" || field === "subtitles.fontUpload";
}

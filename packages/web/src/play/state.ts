import type { StageKind } from "@app/kernel/pipeline.js";
import type {
  EntryChoice,
  EntryMode,
  Format,
  ImagePromptChoice,
  ProviderChoice,
  RunDraft,
  StageSource,
  VoiceChoice,
} from "@app/slices/admission/model.js";
import { allowedSources } from "@app/slices/admission/rules.js";
import type { Entry } from "@app/slices/library/model.js";
import type { Chunking } from "@app/slices/narration/chunk.js";
import type { StagedFile } from "@app/slices/storage/model.js";

// Everything the Play form holds between one page load and the run it posts. It is a
// plain value: `routes/play.tsx` keeps one in `useState`, every function here is pure,
// and `draftOf` is the only place that turns it into the body the server reads.

// One picked file and how far its copy into staging got. A file starts copying the moment
// it is picked (`logic/05` step 5); until the copy finishes the run cannot start (§Q44).
// The whole staged row is kept rather than its id, because the admission rule the form
// runs live is handed the same rows the server's own copy is handed.
export interface Upload {
  readonly key: string;
  readonly name: string;
  readonly file: StagedFile | undefined;
  readonly error: string | undefined;
}

export interface ProvidedState {
  readonly research: string;
  readonly article: string;
  readonly audio: Upload | undefined;
  readonly images: readonly Upload[];
  readonly thumbnail: Upload | undefined;
}

export interface PlayFormState {
  readonly title: string;
  readonly format: Format;
  readonly sources: Readonly<Record<StageKind, StageSource>>;
  readonly llm: ProviderChoice;
  readonly audio: VoiceChoice;
  readonly images: ProviderChoice;
  readonly articlePrompt: string;
  // The ticked image prompts, in tick order, each with its Number (`logic/09`, §Q30).
  readonly imagePrompts: readonly ImagePromptChoice[];
  readonly thumbnailPrompt: string;
  // The picked entry's name, or "" for Off (`logic/04` §Q91).
  readonly intro: string;
  readonly outro: string;
  readonly chunking: Chunking;
  // Every value the user has typed, including one for a slot no prompt asks for any more:
  // unticking a prompt and ticking it again gives its field back with what was in it.
  readonly values: Readonly<Record<string, string>>;
  readonly provided: ProvidedState;
}

// `logic/04` step 1: format 16:9; intro and outro Off; research Off; thumbnail Off;
// article, audio and images Generate; nothing else picked. `logic/08` step 2's first case
// is the chunking that adds nothing the user did not ask for.
export const freshForm: PlayFormState = {
  title: "",
  format: "16:9",
  sources: {
    research: "off",
    article: "generate",
    audio: "generate",
    images: "generate",
    thumbnail: "off",
    video: "generate",
  },
  llm: { provider: "", model: "" },
  audio: { provider: "", model: "", voice: "" },
  images: { provider: "", model: "" },
  articlePrompt: "",
  imagePrompts: [],
  thumbnailPrompt: "",
  intro: "",
  outro: "",
  chunking: { mode: "whole" },
  values: {},
  provided: { research: "", article: "", audio: undefined, images: [], thumbnail: undefined },
};

export const sourceLabels: Readonly<Record<StageSource, string>> = {
  off: "Off",
  generate: "Generate",
  provide: "Provide",
  from_prompt: "From prompt",
  prompt_by_llm: "Prompt by LLM",
};

// The switch a stage draws, straight from the rule that will judge it. Video has one
// legal source and no switch (`logic/01` step 5), which is why the caller checks the
// length rather than this function hiding it.
export function sourceOptions(
  kind: StageKind,
): readonly { readonly value: StageSource; readonly label: string }[] {
  return allowedSources[kind].map((value) => ({ value, label: sourceLabels[value] }));
}

// `logic/04` §Q28 with `logic/10` §Q81 and §Q97, said in the form's own vocabulary so the
// cue sheet can hide the LLM row before anything is posted. The rule itself says it
// again over the draft; this is what decides whether the row is drawn at all.
export function needsLlm(form: PlayFormState, entries: readonly Entry[]): boolean {
  return (
    form.sources.research === "generate" ||
    form.sources.article === "generate" ||
    form.sources.thumbnail === "prompt_by_llm" ||
    modeOf(entries, "intro", form.intro) === "llm" ||
    modeOf(entries, "outro", form.outro) === "llm"
  );
}

export function modeOf(
  entries: readonly Entry[],
  category: "intro" | "outro",
  name: string,
): EntryMode | undefined {
  if (name === "") {
    return undefined;
  }
  return entries.find((entry) => entry.category === category && entry.name === name)?.mode;
}

// Every staged row the form knows about, which is what the admission rule checks the
// provided ids against.
export function stagedOf(provided: ProvidedState): readonly StagedFile[] {
  return [provided.audio, provided.thumbnail, ...provided.images].flatMap((upload) =>
    upload?.file === undefined ? [] : [upload.file],
  );
}

export interface DraftInput {
  readonly form: PlayFormState;
  readonly entries: readonly Entry[];
  // The names the picked prompts and entries ask for: a value the run no longer needs is
  // not carried onto the project (`logic/03` step 6).
  readonly slots: readonly string[];
  // `logic/11` §Q99: the gap beside a segment that exists, as Settings has it.
  readonly silenceGapSeconds: number;
}

export function draftOf(input: DraftInput): RunDraft {
  const { form } = input;
  return {
    title: form.title,
    format: form.format,
    // `logic/01` step 5: video is generated whatever the form says.
    sources: { ...form.sources, video: "generate" },
    llm: form.llm,
    audio: form.audio,
    images: form.images,
    articlePrompt: form.articlePrompt,
    imagePrompts: form.imagePrompts,
    thumbnailPrompt: form.thumbnailPrompt,
    ...pick(entryChoice(input, "intro"), (intro) => ({ intro })),
    ...pick(entryChoice(input, "outro"), (outro) => ({ outro })),
    values: valuesFor(form.values, input.slots),
    provided: {
      research: form.provided.research,
      article: form.provided.article,
      ...pick(form.provided.audio?.file, (file) => ({ audio: file.id })),
      ...pick(form.provided.thumbnail?.file, (file) => ({ thumbnail: file.id })),
      images: form.provided.images.flatMap((image) =>
        image.file === undefined ? [] : [image.file.id],
      ),
    },
    chunking: form.chunking,
    silenceGapSeconds: input.silenceGapSeconds,
  };
}

// `exactOptionalPropertyTypes` is on, so an optional member is either written with a
// value or not written at all. This spreads nothing for the absent case and keeps the
// member's own name at the call site.
function pick<T, R extends object>(value: T | undefined, into: (present: T) => R): R | object {
  return value === undefined ? {} : into(value);
}

// The request says which entry; the library says what it is. The server reads the saved
// mode again before it judges the draft (`slices/library/slots.ts`), so a stale mode here
// changes what the form shows and never what the run does.
function entryChoice(input: DraftInput, category: "intro" | "outro"): EntryChoice | undefined {
  const name = category === "intro" ? input.form.intro : input.form.outro;
  const mode = modeOf(input.entries, category, name);
  return name === "" || mode === undefined ? undefined : { name, mode };
}

function valuesFor(
  values: Readonly<Record<string, string>>,
  slots: readonly string[],
): Record<string, string> {
  // Prototype-free for the reason `slices/admission/rules.ts` gives: a slot name is
  // whatever the prompt author typed, "__proto__" included.
  const kept: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const name of slots) {
    kept[name] = Object.hasOwn(values, name) ? (values[name] ?? "") : "";
  }
  return kept;
}

import { aliasMatches, applyAliases } from "../../kernel/ports/narration-aliases.js";
import { splitText } from "../../kernel/ports/text.js";
import type { FingerprintValue } from "../../kernel/runner/work.js";
import type { RunConfig } from "../admission/model.js";
import { narrationAliasesOf, usesNarrationPreparation } from "../admission/rules.js";
import { aliasSpans, withAliasSpans } from "../narration/aliases.js";
import { normalizeNarrationText } from "../narration/plan.js";
import {
  type GlossaryEntry,
  type GlossaryResult,
  parsePronunciationGlossary,
  pronunciationSpans,
} from "../narration/pronunciation.js";
import { withSharedGlossary } from "../narration/shared-glossary.js";
import { prepareRequests } from "../narration/steering.js";
import { groupTurns } from "../voices/grouping.js";
import { type Speaker, speakerPace, type VoicesSettings } from "../voices/model.js";
import { parseScript, type Script } from "../voices/script.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";
import { pauseValues } from "./recipe-pauses.js";
import {
  preparationForGroup,
  preparationFuture,
  preparationTemplate,
} from "./recipe-preparation.js";
import type { ScriptText } from "./recipe-text.js";

// The body narration of a multi-voice run: the script's turns, each in its speaker's voice.
// One logical group per turn (`audio:body:turn:<n>`), or per run of turns a native
// multi-speaker model speaks in one request, so changing one speaker's voice changes only the
// requests that speaker is in and every other turn keeps its audio. The join adds the gap
// between turns and each speaker's pace, which cost nothing to change.
//
// With a Narration Preparation prompt, each turn of a speaker on Inworld TTS-2 is prepared on
// its own first: the text model gets the turn's sentences and who says them, and answers
// delivery cues that become Inworld's bracketed tags in that turn's request. The turn's clean
// words stay its transcript, so the captions and the word timing never see a tag.

export interface VoiceBody {
  // The turns' preparation steps, which the parts that use them wait on.
  readonly preparations: readonly ResolvedWorkRecipe[];
  readonly parts: readonly ResolvedWorkRecipe[];
  readonly body: ResolvedWorkRecipe;
  readonly transcript: FingerprintValue;
  readonly sections?: Script["sections"] | undefined;
}

export function voiceBodyRecipes(
  context: RecipeContext,
  voices: VoicesSettings,
  script: ScriptText,
  glossary: GlossaryResult | null,
): VoiceBody {
  const parts: ResolvedWorkRecipe[] = [];
  const preparations: ResolvedWorkRecipe[] = [];
  const layout: [number, number][] = [];
  // Which parts end a turn, for the pauses between sentences (a turn gap of 0 is still a turn).
  const turnEnds = new Set<number>();
  let transcript: FingerprintValue = script.fingerprint ?? script.text ?? null;
  const parsed = script.text === null ? undefined : parseScript(script.text, voices.speakers);
  const prepare = voices.speakers.some((speaker) => preparesTurns(context.config, speaker));
  // The narration still to be worked out: the whole script's while it is being written, or
  // every turn's while a turn's delivery cues are (as a single voice waits for all of its own).
  const future = (): ResolvedWorkRecipe =>
    recipe(
      context,
      "audio:body:future",
      "audio",
      {
        kind: "deferred",
        version: 1,
        operation: "body-narration",
        template: [
          script.fingerprint ?? script.text ?? null,
          speakerValues(voices),
          ...(prepare ? [preparationTemplate(context)] : []),
        ],
      },
      [...new Set([...script.dependsOn, ...preparations.map((row) => row.key)])],
    );
  let pending = false;
  if (script.text === null) {
    // Turns not yet known are prepared behind one future step, as a single voice's text is.
    const from = script.dependsOn[0];
    if (prepare && from !== undefined)
      preparations.push(
        preparationFuture(context, "body", { key: from, fingerprint: script.fingerprint ?? from }),
      );
    parts.push(future());
  } else if (parsed !== undefined && !parsed.ok) {
    parts.push(
      refused(
        context,
        "audio:body:turn:1",
        script.dependsOn,
        `The script can't be narrated: ${parsed.reason} Fix it in Edit project → Article, then Try again.`,
      ),
    );
  } else if (parsed !== undefined) {
    transcript = [
      "voices-transcript-v1",
      parsed.script.turns.map((turn) => [turn.speaker, turn.text]),
    ];
    const aliases = narrationAliasesOf(context.config);
    for (const group of groupTurns(
      parsed.script.turns,
      voices.speakers,
      voices.nativeDialogue,
      (text) => applyAliases(text, aliases).length,
    )) {
      const first = group.turns[0];
      const speaker = voices.speakers.find((one) => one.id === first?.speaker);
      if (first === undefined || speaker === undefined) continue;
      const made = groupParts(
        context,
        voices,
        group.native,
        group.turns,
        speaker,
        glossary,
        script,
        preparations,
      );
      if (made.length === 0) pending = true;
      made.forEach((part, index) => {
        parts.push(part);
        if (index === made.length - 1) turnEnds.add(layout.length);
        layout.push([speakerPace(speaker), index === made.length - 1 ? voices.turnGapSeconds : 0]);
      });
    }
    // No gap after the last turn: the timeline's own gap follows it.
    const last = layout.at(-1);
    if (last !== undefined) last[1] = 0;
    if (pending) {
      parts.length = 0;
      layout.length = 0;
      turnEnds.clear();
      parts.push(future());
    }
  }
  const body = recipe(
    context,
    "audio:body:concat",
    "audio",
    {
      kind: "local",
      version: 1,
      operation: "concat-turns-v1",
      values: [
        parts.map((part) => resourceIdentity(context, part)),
        layout,
        // Pauses between sentences inside a turn; the turn gap stays the layout's.
        ...pauseValues(
          context.config,
          layout.map(([, gap], at) =>
            at === layout.length - 1 ? "end" : gap > 0 || turnEnds.has(at) ? "turn" : "sentence",
          ),
        ),
      ],
    },
    parts.map((part) => part.key),
    { unresolved: parsed?.ok !== true || pending },
  );
  return {
    preparations,
    parts,
    body,
    transcript,
    ...(parsed?.ok === true ? { sections: parsed.script.sections } : {}),
  };
}

function groupParts(
  context: RecipeContext,
  voices: VoicesSettings,
  native: boolean,
  turns: Script["turns"],
  speaker: Speaker,
  glossary: GlossaryResult | null,
  script: ScriptText,
  preparations: ResolvedWorkRecipe[],
): readonly ResolvedWorkRecipe[] {
  const first = turns[0];
  if (first === undefined) return [];
  const logicalKey = `audio:body:turn:${String(first.index)}`;
  const override = context.content.narrationOverrides[logicalKey];
  if (override?.kind === "asset")
    return [
      recipe(
        context,
        `${logicalKey}:1`,
        "audio",
        {
          kind: "provided",
          version: 1,
          assetId: override.assetId,
          semantic: [turns.map((turn) => turn.text).join("\n"), speaker.id],
        },
        script.dependsOn,
        { tokenKey: logicalKey },
      ),
    ];
  if (native) {
    const byId = new Map(voices.speakers.map((one) => [one.id, one]));
    // Narration aliases reach every line of the one request, each turn on its own so an alias
    // never joins the end of one turn to the start of the next. The clean turns stay the
    // transcript, as they do for a voice that gets one request per turn.
    const aliases = narrationAliasesOf(context.config);
    const spoken = turns.map((turn) => applyAliases(turn.text, aliases));
    const logicalText = turns.map((turn) => turn.text).join("\n");
    const text = spoken.join("\n");
    return [
      recipe(
        context,
        `${logicalKey}:1`,
        "audio",
        {
          kind: "tts",
          version: 1,
          provider: speaker.voice.provider,
          model: speaker.voice.model,
          voice: speaker.voice.voice,
          text,
          ...(text === logicalText ? {} : { spokenText: logicalText }),
          logicalKey,
          logicalText,
          segment: "body",
          pronunciation: null,
          dialogue: turns.map((turn, index) => ({
            speaker: turn.speaker,
            turn: turn.index,
            voice: byId.get(turn.speaker)?.voice.voice ?? "",
            text: spoken[index] ?? turn.text,
          })),
        },
        script.dependsOn,
        { tokenKey: logicalKey },
      ),
    ];
  }
  const logicalText = normalizeNarrationText(
    override?.kind === "text" ? override.text : first.text,
  );
  const entries = speakerGlossary(context, speaker, glossary);
  if (!entries.ok) return [refused(context, logicalKey, script.dependsOn, entries.reason)];
  const maxCharacters =
    context.catalogue?.tts.find(
      (row) =>
        row.provider === speaker.voice.provider &&
        row.id === speaker.voice.model &&
        row.enabled &&
        !row.deprecated,
    )?.tts.maxCharacters ?? Math.max(2, logicalText.length * 4);
  // Narration aliases apply to every voice, the speaker's pronunciations to IPA voices only.
  const spans = withAliasSpans(
    pronunciationSpans(logicalText, entries.entries),
    aliasSpans(logicalText, narrationAliasesOf(context.config)),
  );
  if (preparesTurns(context.config, speaker)) {
    const prepared = preparationForGroup(
      context,
      logicalKey,
      logicalText,
      "body",
      script.dependsOn,
      maxCharacters,
      spans,
      aliasMatches(logicalText, narrationAliasesOf(context.config)),
      { name: speaker.name.trim(), role: speaker.role },
    );
    preparations.push(prepared.preparation);
    if (prepared.refusal !== null)
      return [refused(context, logicalKey, [prepared.preparation.key], prepared.refusal)];
    return (prepared.requests ?? []).map((request, index) =>
      recipe(
        context,
        `${logicalKey}:${String(index + 1)}`,
        "audio",
        {
          kind: "tts",
          version: 1,
          provider: speaker.voice.provider,
          model: speaker.voice.model,
          voice: speaker.voice.voice,
          text: request.text,
          spokenText: request.spokenText,
          logicalKey,
          logicalText,
          segment: "body",
          pronunciation: null,
          speaker: speaker.id,
          turn: first.index,
        },
        [prepared.preparation.key],
        { tokenKey: logicalKey, unresolved: logicalText.length === 0 },
      ),
    );
  }
  let requests: readonly { readonly text: string; readonly spokenText?: string }[];
  if (spans.length > 0) {
    const prepared = prepareRequests(logicalText, [], maxCharacters, spans);
    if (!prepared.ok) return [refused(context, logicalKey, script.dependsOn, prepared.reason)];
    requests = prepared.requests;
  } else requests = splitText(logicalText, maxCharacters).map((text) => ({ text }));
  return requests.map((request, index) =>
    recipe(
      context,
      `${logicalKey}:${String(index + 1)}`,
      "audio",
      {
        kind: "tts",
        version: 1,
        provider: speaker.voice.provider,
        model: speaker.voice.model,
        voice: speaker.voice.voice,
        text: request.text,
        ...(request.spokenText === undefined ? {} : { spokenText: request.spokenText }),
        logicalKey,
        logicalText,
        segment: "body",
        pronunciation: null,
        speaker: speaker.id,
        turn: first.index,
      },
      script.dependsOn,
      { tokenKey: logicalKey, unresolved: logicalText.length === 0 },
    ),
  );
}

// IPA pronunciations reach only the voices that read IPA: the speaker's own first, then the
// run's glossary where Use Pronunciation Glossary is on.
function speakerGlossary(
  context: RecipeContext,
  speaker: Speaker,
  glossary: GlossaryResult | null,
): GlossaryResult {
  if (!readsIpa(speaker)) return { ok: true, entries: [] };
  const own = speaker.pronunciations?.trim()
    ? parsePronunciationGlossary(speaker.pronunciations, context.config.language)
    : { ok: true as const, entries: [] as readonly GlossaryEntry[] };
  if (!own.ok)
    return {
      ok: false,
      reason: `${speaker.name.trim()}'s pronunciations can't be used: ${own.reason.replace("Edit the glossary or turn off Use Pronunciation Glossary.", "Fix them under Speakers (Play → Audio, or Edit project → Providers).")}`,
    };
  const run =
    context.config.audio?.usePronunciationGlossary === true && glossary?.ok === true
      ? glossary.entries
      : [];
  return { ok: true, entries: withSharedGlossary(own.entries, run) };
}

// A turn is prepared when the run has a Narration Preparation prompt and its speaker's voice
// takes Inworld TTS-2's delivery tags; every other speaker's turns are spoken as written.
export function preparesTurns(
  config: Pick<RunConfig, "sources" | "narrationPrompt">,
  speaker: Speaker,
): boolean {
  return (
    usesNarrationPreparation(config) &&
    speaker.voice.provider === "inworld" &&
    speaker.voice.model === "inworld-tts-2"
  );
}

export function readsIpa(speaker: Speaker): boolean {
  return (
    speaker.voice.provider === "inworld" &&
    (speaker.voice.model === "inworld-tts-2" || speaker.voice.model === "inworld-tts-2-flash")
  );
}

function refused(
  context: RecipeContext,
  logicalKey: string,
  dependsOn: readonly string[],
  reason: string,
): ResolvedWorkRecipe {
  return recipe(
    context,
    `${logicalKey}:1`,
    "audio",
    { kind: "deferred", version: 1, operation: "resolve-revision-recipe", template: reason },
    dependsOn,
    { unresolved: true, refusal: reason },
  );
}

// What a pending script will be spoken with, so a voice change before the script lands is
// still a change.
export function speakerValues(voices: VoicesSettings): FingerprintValue {
  return [
    voices.nativeDialogue,
    voices.speakers.map((speaker) => [
      speaker.id,
      speaker.voice.provider,
      speaker.voice.model,
      speaker.voice.voice,
      speaker.pronunciations ?? null,
    ]),
  ];
}

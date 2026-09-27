import { applyAliases } from "../../kernel/ports/narration-aliases.js";
import { splitText } from "../../kernel/ports/text.js";
import type { FingerprintValue } from "../../kernel/runner/work.js";
import { narrationAliasesOf } from "../admission/rules.js";
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
import type { ScriptText } from "./recipe-text.js";

// The body narration of a multi-voice run: the script's turns, each in its speaker's voice.
// One logical group per turn (`audio:body:turn:<n>`), or per run of turns a native
// multi-speaker model speaks in one request, so changing one speaker's voice changes only the
// requests that speaker is in and every other turn keeps its audio. The join adds the gap
// between turns and each speaker's pace, which cost nothing to change.

export interface VoiceBody {
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
  const layout: [number, number][] = [];
  let transcript: FingerprintValue = script.fingerprint ?? script.text ?? null;
  const parsed = script.text === null ? undefined : parseScript(script.text, voices.speakers);
  if (script.text === null) {
    parts.push(
      recipe(
        context,
        "audio:body:future",
        "audio",
        {
          kind: "deferred",
          version: 1,
          operation: "body-narration",
          template: [script.fingerprint ?? null, speakerValues(voices)],
        },
        script.dependsOn,
      ),
    );
  } else if (parsed !== undefined && !parsed.ok) {
    parts.push(
      refused(
        context,
        "audio:body:turn:1",
        script.dependsOn,
        `The script can't be narrated: ${parsed.reason} Fix it in Edit project → Article, then Retry stage.`,
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
      );
      made.forEach((part, index) => {
        parts.push(part);
        layout.push([speakerPace(speaker), index === made.length - 1 ? voices.turnGapSeconds : 0]);
      });
    }
    // No gap after the last turn: the timeline's own gap follows it.
    const last = layout.at(-1);
    if (last !== undefined) last[1] = 0;
  }
  const body = recipe(
    context,
    "audio:body:concat",
    "audio",
    {
      kind: "local",
      version: 1,
      operation: "concat-turns-v1",
      values: [parts.map((part) => resourceIdentity(context, part)), layout],
    },
    parts.map((part) => part.key),
    { unresolved: parsed?.ok !== true },
  );
  return {
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

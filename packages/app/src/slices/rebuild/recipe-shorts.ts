import { z } from "zod";
import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import { subjectOf } from "../admission/model.js";
import { usesShorts } from "../admission/rules.js";
import { withoutScene } from "../images/scenes.js";
import { pausesOf } from "../narration/pauses-model.js";
import { narrationRegenerationToken } from "../narration/plan.js";
import { effectiveClips, type PickedShorts, pickedShortsOf } from "../shorts/clips.js";
import {
  defaultShortsImagePrompt,
  musicVolumeOf,
  shortImageCount,
  shortsSpeedOf,
} from "../shorts/model.js";
import type { ShortPick } from "../shorts/pick.js";
import { imagePromptMessages } from "../shorts/prompts.js";
import { type ImageAppearance, lookWait, withLooks } from "./recipe-appearance.js";
import { voiceValues } from "./recipe-audio-parts.js";
import { breathValues } from "./recipe-breaths.js";
import { castFor } from "./recipe-cast.js";
import { type MasterPlan, noMaster } from "./recipe-loudness.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
  selectedAsset,
  selectedReference,
} from "./recipe-model.js";
import { castField, type ImageReference, imageChoice } from "./recipe-reference.js";
import { llmInput, promptOf } from "./recipe-text.js";

// The Shorts step unfolds as its answers land, the way research's chapters unfold from the
// plan. `shorts:pick` reads the word timing, so it waits for `subtitles:timing` and runs
// beside the render; until its saved answer matches, one deferred `shorts:future` stands in
// for everything after it (and carries the images' cost). Each picked clip then gets
// `shorts:N:prompts`, one LLM call writing its image prompts; once those match, its
// `shorts:N:image:M` images and its `shorts:N:render`.
//
// A clip's work carries the clip's own token (`clipToken`): the pick's token from when the
// clip was first picked, plus the one "Make this short again" renews under `shorts:N`. So
// picking the moments again redoes only the clips whose sentences changed, and one short
// can be made again alone.
//
// Shorts are cut from the body only, on the body's own clock (`bodyTiming`): the pick reads
// the body's words with times from the body's start, and its fingerprint holds the body's
// narration and timing, not the intro's or outro's. A new intro or outro moves every word of
// the video's timing, yet leaves the pick, each clip's prompts and images, and its render as
// they are; the render finds the body where it now starts. A pick saved before this, on the
// video's clock, is kept while the timing it read is unchanged (`legacy` below).
export const shortsPickKey = "shorts:pick";
export const shortsFutureKey = "shorts:future";
// The first value of a pick and a render on the body's clock.
export const bodyClockValue = "body-clock-v1";

export function shortsRecipes(
  context: RecipeContext,
  exports: readonly ResolvedWorkRecipe[],
  // The establishing image the shorts' images are drawn from, when it is on.
  reference?: ImageReference,
  // "Show tables and figures on screen": the cards a short shows where it describes one.
  cards: readonly ResolvedWorkRecipe[] = [],
  // Level the volume: the levelled narration and the master (`recipe-loudness.ts`).
  master: MasterPlan = noMaster,
  // How the figures look, for a shorts image prompt with `{{Appearance}}` (`recipe-appearance.ts`).
  appearance?: ImageAppearance,
  // The body alone, what a short on the body's clock is cut from: its levelled sound and, when
  // it is voiced chunk by chunk, its chunks.
  narration: BodyNarration = { master },
): readonly ResolvedWorkRecipe[] {
  const { config } = context;
  const shorts = config.shorts;
  const timing = exports.find((value) => value.key === "subtitles:timing");
  if (!usesShorts(config) || shorts === undefined || timing === undefined) return [];
  const prompt = shorts.prompt?.trim() ? promptOf(context, "shorts") : undefined;
  // A shorts image prompt may name `{{Scene}}` like the video's: the prompts call already writes
  // each image's moment from what the clip says, so that line is left out here.
  const styled = shorts.imagePrompt?.trim() ? promptOf(context, "shortsImage") : undefined;
  const pickFor = (timingIdentity: FingerprintValue): ResolvedWorkRecipe =>
    recipe(
      context,
      shortsPickKey,
      "video",
      {
        kind: "local",
        version: 1,
        operation: "shorts-pick-v1",
        values: [
          timingIdentity,
          config.llm?.provider ?? "",
          config.llm?.model ?? "",
          config.llm?.thinking ?? null,
          // Blank means the built-in prompt; the step fills it in, so a new built-in wording
          // ships as a new operation version rather than a silent change here.
          prompt?.text ?? "",
          shorts.count,
          shorts.minSeconds,
          shorts.maxSeconds,
          subjectOf(config),
          // The project language, only when it is not English, so English keeps its fingerprint.
          ...(config.language === undefined || config.language === "en" ? [] : [config.language]),
          // The shorts kept through a change of their moments, only when there are any, so
          // every other project keeps its fingerprint (`shorts/keep.ts`).
          ...(context.content.shortsKeep === undefined
            ? []
            : [
                [
                  "keep-v1",
                  context.content.shortsKeep.map((short) => [
                    short.from,
                    short.opening,
                    short.closing,
                    short.sentences,
                    short.title,
                    short.description,
                    [...short.hashtags],
                    short.why,
                    short.seed ?? null,
                    // Only on lists that remember every word, so older lists keep theirs.
                    ...(short.text === undefined ? [] : [short.text]),
                  ]),
                ],
              ]),
        ],
      },
      [...new Set([timing.key, ...(prompt?.dependsOn ?? []), ...(styled?.dependsOn ?? [])])],
      // A paid LLM call: readiness, the charge warning and the estimate treat it like one.
      { kind: "provider" },
    );
  // A pick saved on the video's clock, asked of the whole timing: kept while it still matches.
  const legacy = pickFor(resourceIdentity(context, timing));
  // The same pick asked of the finished timing as it was recorded: a run's plan reads the
  // catalogue, which gives the timing another fingerprint than the one the version was saved
  // with, while the timing file is the same.
  const asset = selectedAsset(context, timing.key, timing.fingerprint);
  const recorded = context.manifest.outputs.find(
    (row) =>
      row.workKey === timing.key &&
      row.assetId === asset &&
      asset !== null &&
      row.fingerprint !== timing.fingerprint &&
      selectedReference(row),
  );
  const legacyPicked = savedPicked(
    context,
    legacy,
    recorded === undefined ? [] : [pickFor([recorded.fingerprint, asset]).fingerprint],
  );
  const chunks = narration.chunks === undefined ? undefined : chunkSource(context, narration);
  const body = bodyTiming(timing, chunks?.anchor);
  const onBody = legacyPicked === undefined && body !== undefined;
  const pick = onBody ? pickFor(body) : legacy;
  const picked = onBody ? savedPicked(context, pick) : legacyPicked;
  // What a render on each clock reads the narration by: the body's timing and its levelled
  // sound, or the whole timing and every levelled part.
  const heard = (clip: ShortPick) =>
    onBody
      ? (chunks?.span(clip, body) ?? { timing: body, master: narration.master })
      : { timing: resourceIdentity(context, timing), master };
  const images = config.images ?? { provider: "", model: "" };
  const style = styled === undefined ? defaultShortsImagePrompt : withoutScene(styled.text);
  if (picked === undefined)
    return [
      pick,
      recipe(
        context,
        shortsFutureKey,
        "video",
        {
          kind: "deferred",
          version: 1,
          operation: "shorts",
          template: [
            pick.fingerprint,
            style,
            images.provider,
            images.model,
            config.imageSeconds,
            shorts.count,
            shorts.maxSeconds,
            config.llm?.provider ?? "",
            config.llm?.model ?? "",
            // Only what is in use, so shorts planned before these existed keep their
            // fingerprint; the estimate reads the fields above by position.
            ...(config.images?.thinking === undefined ? [] : [config.images.thinking]),
            ...(reference === undefined ? [] : [reference.input.fingerprint]),
          ],
        },
        [pick.key],
        { tokenKey: shortsPickKey },
      ),
    ];
  const recipes: ResolvedWorkRecipe[] = [pick];
  const clips = effectiveClips(picked, context.content.shortsRanges, pick.fingerprint, shorts);
  for (const clip of clips) {
    const prefix = `shorts:${String(clip.number)}`;
    const token = clipToken(context, clip);
    const count = shortImageCount(clip.end - clip.start, config.imageSeconds);
    // The looks of the figures the clip names, and always the subject's: a short stands for
    // the video. Until they are looked up the clip's prompts wait for them.
    const looked = withLooks(style, appearance, clip.text, { subjectAlways: true });
    if (looked === null) {
      const wait = lookWait(style, appearance);
      recipes.push(
        recipe(
          context,
          `${prefix}:prompts`,
          "video",
          {
            kind: "deferred",
            version: 1,
            operation: "shorts",
            template: [...wait.template, style, clip.text, count],
          },
          [pick.key, ...wait.dependsOn],
          { token },
        ),
      );
      continue;
    }
    const prompts = {
      ...recipe(
        context,
        `${prefix}:prompts`,
        "video",
        llmInput(
          context,
          imagePromptMessages({
            style: looked,
            videoTitle: subjectOf(config),
            shortTitle: clip.title,
            text: clip.text,
            count,
            imageSeconds: config.imageSeconds,
          }),
        ),
        [pick.key],
        { token },
      ),
      unfoldsImages: { count, provider: images.provider, model: images.model },
    };
    recipes.push(prompts);
    const written = savedPrompts(context, prompts, token);
    if (written === undefined || written.length !== count) continue;
    const stills = written.map((prompt, index) =>
      recipe(
        context,
        `${prefix}:image:${String(index + 1)}`,
        "video",
        {
          kind: "image",
          version: 1,
          ...imageChoice(config),
          prompt,
          aspect: "9:16",
          ...(reference === undefined ? {} : { reference: reference.input }),
          ...castField(castFor(config, prompt)),
        },
        [prompts.key, ...(reference === undefined ? [] : [reference.key])],
        { token },
      ),
    );
    recipes.push(...stills);
    const extras = renderExtras(context, clip);
    const sound = heard(clip);
    recipes.push(
      recipe(
        context,
        `${prefix}:render`,
        "video",
        {
          kind: "local",
          version: 1,
          operation: "short-render-v1",
          values: [
            sound.timing,
            clip.number,
            // On its chunks, a clip is placed by its words when it renders: where the body's
            // other chunks moved it is no reason to cut it again.
            ...("chunks" in sound ? [clip.text] : [clip.start, clip.end]),
            stills.map((still) => resourceIdentity(context, still)),
            config.imageSeconds,
            config.zoomPercent,
            config.motionStyle,
            config.subtitles?.fontId ?? "default",
            // Only when one of the later settings is in use, so a short rendered before
            // they existed keeps its fingerprint.
            ...(extras === undefined ? [] : [extras]),
            // Only with cards, so a short rendered before them keeps its fingerprint.
            ...(cards.length === 0
              ? []
              : [["figure-cards-v1", cards.map((card) => resourceIdentity(context, card))]]),
            // Only while the volume is levelled, so every short without it keeps its fingerprint.
            ...sound.master.values,
          ],
        },
        [
          pick.key,
          ...stills.map((still) => still.key),
          ...cards.map((card) => card.key),
          ...sound.master.keys,
        ],
        { token },
      ),
    );
  }
  return recipes;
}

// What the shorts' pick reads on the body's clock: the body's narration as the word timing was
// made from it (its file once it is made, else its recipe, with what it says), and how the
// words are timed. Not the intro or outro, the silence between them or at the edges: those
// move the body's words on the video's clock and not on its own. Undefined when the timing
// has no body to find.
export function bodyTiming(
  timing: Pick<ResolvedWorkRecipe, "input" | "dependsOn">,
  // The body's chunks as they were voiced, in place of the body's file (`chunkSource`).
  chunks?: FingerprintValue,
): FingerprintValue | undefined {
  if (timing.input.kind !== "local" || !Array.isArray(timing.input.values)) return undefined;
  const values: readonly FingerprintValue[] = timing.input.values;
  const [timeline, , language, , ...words] = values;
  const at = timing.dependsOn.findIndex((key) => key !== "audio:intro" && key !== "audio:outro");
  if (!Array.isArray(timeline) || at < 0) return undefined;
  const entries: readonly FingerprintValue[] = timeline;
  const entry = entries[at];
  if (!isRecord(entry)) return undefined;
  const audio = entry.audio;
  const file = Array.isArray(audio) && typeof audio[1] === "string" ? audio[1] : undefined;
  return [
    bodyClockValue,
    timing.input.operation,
    chunks ?? (file === undefined ? entry : ["file", file, entry.transcript ?? null]),
    language ?? null,
    ...words,
  ];
}

// The body as `shortsRecipes` reads it apart from the timing.
export interface BodyNarration {
  // Level the volume for the body alone.
  readonly master: MasterPlan;
  // The body's narration chunks in reading order, with the words each was voiced from.
  readonly chunks?: readonly { readonly key: string; readonly text: string }[] | undefined;
  // The levelled body, whose settings a short's sound is levelled by.
  readonly level?: ResolvedWorkRecipe | undefined;
}

// A body voiced chunk by chunk. The pick reads the chunks' words and how they were asked for
// (`anchor`): a chunk's own regeneration, the voice, the pauses. Not their files, which land
// mid-run; a change that brings a new file is in the request. Each short is cut from the chunks
// its sentences fall in (`span`), so a chunk voiced again elsewhere, or words added before it,
// leave it as it is. A clip whose words can't be found once among the chunks reads all of them.
function chunkSource(context: RecipeContext, narration: BodyNarration) {
  const list = narration.chunks ?? [];
  const tokens = context.content.regenerationTokens;
  const token = (key: string) => narrationRegenerationToken(tokens, key, "body");
  const asked = [voiceValues(context), pausesValue(context)];
  const anchor: FingerprintValue = [
    "chunks-v1",
    list.map((chunk) => [chunk.text, token(chunk.key)]),
    ...asked,
  ];
  // What the body was voiced from, in order: each chunk's requests as they were made (a chunk
  // longer than the voice takes in one request is several), with the words each said and its
  // file; a chunk not voiced yet is itself one. Read from the version's records, not the plan,
  // so a plan that splits a chunk otherwise reads the same files.
  const units = list.flatMap((chunk) => {
    const parts = context.manifest.pieces
      .flatMap((row) => {
        const number = row.key.startsWith(`${chunk.key}:`)
          ? Number(row.key.slice(chunk.key.length + 1))
          : Number.NaN;
        if (
          !Number.isInteger(number) ||
          row.piece.state !== "done" ||
          !selectedReference(row) ||
          row.assetId === null
        )
          return [];
        const text = partText(row.piece.payload);
        return text === undefined ? [] : [{ number, text, file: row.assetId }];
      })
      .toSorted((left, right) => left.number - right.number);
    const whole = parts.length > 0 && parts.every((part, at) => part.number === at + 1);
    return whole
      ? parts.map((part) => ({
          text: part.text,
          identity: [part.text, token(chunk.key), part.file] as FingerprintValue,
        }))
      : [{ text: chunk.text, identity: [chunk.text, token(chunk.key), null] as FingerprintValue }];
  });
  // Their words run together, letters and digits only, with where each one ends.
  let stream = "";
  const ends: number[] = [];
  for (const unit of units) {
    stream += spokenLetters(unit.text);
    ends.push(stream.length);
  }
  const level =
    narration.level?.input.kind === "local" && Array.isArray(narration.level.input.values)
      ? narration.level.input.values.slice(2)
      : [];
  // The levelled body's master, with the body's own levelled file left out: how it is levelled.
  const master: MasterPlan = {
    keys: narration.master.keys,
    values: narration.master.values.map((value) =>
      Array.isArray(value) && value[0] === "loudness-v1"
        ? ["span-loudness-v1", level, ...value.slice(2)]
        : value,
    ),
  };
  return {
    anchor,
    span: (clip: Pick<ShortPick, "text">, body: FingerprintValue) => {
      const words = spokenLetters(clip.text);
      const at = words === "" ? -1 : stream.indexOf(words);
      if (at < 0 || stream.indexOf(words, at + 1) >= 0) return undefined;
      const first = ends.findIndex((end) => end > at);
      const last = ends.findIndex((end) => end >= at + words.length);
      if (first < 0 || last < 0) return undefined;
      const values: readonly FingerprintValue[] = Array.isArray(body) ? body : [];
      return {
        chunks: true as const,
        timing: [
          bodyClockValue,
          "span-v1",
          // How the words are timed: the timing operation, language and voices marker.
          values[1] ?? null,
          values[3] ?? null,
          ...values.slice(4),
          units.slice(first, last + 1).map((unit) => unit.identity),
          ...asked,
          breathValues(context.config),
        ],
        master,
      };
    },
  };
}

// The words a narration request was voiced from, as its piece saved them.
function partText(payload: string | null): string | undefined {
  if (payload === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(payload);
    return typeof parsed === "object" &&
      parsed !== null &&
      "text" in parsed &&
      typeof parsed.text === "string"
      ? parsed.text
      : undefined;
  } catch {
    return undefined;
  }
}

function pausesValue(context: RecipeContext): FingerprintValue {
  const pauses = pausesOf(context.config);
  return pauses === undefined ? null : [pauses.sentenceSeconds, pauses.paragraphSeconds];
}

// What a text says, as letters and digits only and without its delivery notes in brackets:
// how a clip's words are found in its chunks whatever the word timing made of the
// punctuation, case and spacing.
export function spokenLetters(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isRecord(
  value: FingerprintValue | undefined,
): value is { readonly [key: string]: FingerprintValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Whether a pick's or a render's values are on the body's clock.
export function onBodyClock(values: FingerprintValue): boolean {
  return Array.isArray(values) && Array.isArray(values[0]) && values[0][0] === bodyClockValue;
}

// What the render draws and plays beyond the clip itself: the title headline, a faster
// speed and the background music at its level. Undefined when none is in use.
export function renderExtras(
  context: Pick<RecipeContext, "config" | "content">,
  clip: Pick<ShortPick, "title">,
):
  | {
      readonly title?: string;
      readonly speed?: number;
      readonly music?: readonly [string, number];
    }
  | undefined {
  const shorts = context.config.shorts;
  if (shorts === undefined) return undefined;
  const speed = shortsSpeedOf(shorts);
  const music = context.content.shortsMusic;
  const extras = {
    ...(shorts.titleOnScreen === true ? { title: clip.title } : {}),
    ...(speed === 1 ? {} : { speed }),
    ...(music === undefined ? {} : { music: [music, musicVolumeOf(shorts)] as const }),
  };
  return Object.keys(extras).length === 0 ? undefined : extras;
}

// The token a clip's prompts, images and render carry: the pick's token from when the clip
// was first picked (the current one for a pick saved before clips kept theirs), with the
// clip's own "Make this short again" token when it has one.
export function clipToken(
  context: Pick<RecipeContext, "content">,
  clip: Pick<ShortPick, "number" | "seed">,
): string | null {
  const tokens = context.content.regenerationTokens;
  const base = clip.seed !== undefined ? clip.seed : (tokens[shortsPickKey] ?? null);
  const own = tokens[shortRemakeKey(clip.number)];
  return own === undefined ? base : fingerprint([base, own]);
}

// The regeneration key "Make this short again" renews for short N.
export function shortRemakeKey(number: number): string {
  return `shorts:${String(number)}`;
}

// What the pick saved, when its saved answer is the one this plan asks for.
export function savedPicked(
  context: RecipeContext,
  pick: ResolvedWorkRecipe,
  // Other fingerprints the same pick has (the one recorded with the finished timing).
  also: readonly string[] = [],
): PickedShorts | undefined {
  const done = context.manifest.pieces.filter(
    (row) => row.key === pick.key && selectedReference(row) && row.piece.state === "done",
  );
  const piece =
    done.find((row) => row.fingerprint === pick.fingerprint) ??
    // A project from before an older fingerprint scheme: its output carries the plan's
    // fingerprint and its piece another one. The version's one selected pick belongs with its
    // selected output, so that output's fingerprint vouches for it.
    (done.length === 1 &&
    context.manifest.outputs.some(
      (row) =>
        row.workKey === pick.key &&
        selectedReference(row) &&
        (row.fingerprint === pick.fingerprint || also.includes(row.fingerprint)) &&
        (row.state === "ready" || row.state === "outdated"),
    )
      ? done[0]
      : undefined);
  return pickedShortsOf(piece?.piece.payload);
}

// A clip's saved image prompts, when they answer this plan's request. The request carries
// the model's thinking settings from the catalogue, which the plan without a catalogue has
// not got, so either fingerprint matches (like `matchingText`).
function savedPrompts(
  context: RecipeContext,
  prompts: ResolvedWorkRecipe,
  token: string | null,
): readonly string[] | undefined {
  const logical =
    context.catalogue === undefined || prompts.input.kind !== "llm"
      ? prompts.fingerprint
      : recipe(
          { content: context.content },
          prompts.key,
          prompts.stage,
          { ...prompts.input, thinkingConfig: null },
          prompts.dependsOn,
          { token },
        ).fingerprint;
  const piece = context.manifest.pieces.find(
    (row) =>
      row.key === prompts.key &&
      selectedReference(row) &&
      row.piece.state === "done" &&
      (row.fingerprint === prompts.fingerprint || row.fingerprint === logical),
  );
  if (piece?.piece.payload === undefined || piece.piece.payload === null) return undefined;
  const parsed = z
    .object({ prompts: z.array(z.string()) })
    .safeParse(JSON.parse(piece.piece.payload));
  return parsed.success ? parsed.data.prompts : undefined;
}

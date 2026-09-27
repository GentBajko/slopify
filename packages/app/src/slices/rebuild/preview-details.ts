import { stageKinds } from "../../kernel/pipeline.js";
import { languageInfo } from "../../kernel/ports/languages.js";
import { type RunConfig, sourceOf } from "../admission/model.js";
import { motionStyleLabels } from "../admission/rules.js";
import { documentThemeLabel } from "../document/model.js";
import { type LoudnessSettings, loudnessLabel } from "../loudness/model.js";
import {
  reviewModeLabels,
  reviewModeOf,
  reviewStageLabels,
  reviewStages,
} from "../reviews/model.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { getRevisionView } from "../revisions/view.js";
import { musicVolumeOf, shortsSpeedOf } from "../shorts/model.js";
import { ambientBedLabels } from "../video/ambient-bed.js";
import { videoEditOf, videoEditRows } from "../video/edit-settings.js";
import type { RebuildPreview } from "./model.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

type Review = NonNullable<RebuildPreview["review"]>;

export function previewDetails(
  deps: RevisionDeps,
  view: RevisionView,
  allRecipes: readonly ResolvedWorkRecipe[],
  selected: ReadonlySet<string>,
): Review {
  const parent =
    view.revision.parentId === null
      ? undefined
      : getRevisionView(deps, view.revision.projectId, view.revision.parentId);
  const requests = allRecipes.flatMap((row) => {
    if (!selected.has(row.key)) return [];
    const input = row.input;
    const narration = narrationIdentity(row);
    if (narration !== undefined) {
      const groups = [
        ...new Set(
          allRecipes.flatMap((one) => {
            const identity = narrationIdentity(one);
            return identity?.segment === narration.segment ? [identity.logicalKey] : [];
          }),
        ),
      ];
      const siblings = allRecipes.filter(
        (one) => narrationIdentity(one)?.logicalKey === narration.logicalKey,
      );
      const segment =
        narration.segment === "body" ? "Body" : narration.segment === "intro" ? "Intro" : "Outro";
      const text =
        input.kind === "tts"
          ? input.text
          : input.kind === "provided" &&
              Array.isArray(input.semantic) &&
              typeof input.semantic[0] === "string"
            ? input.semantic[0]
            : null;
      return [
        {
          key: row.key,
          label: `${segment} narration chunk ${groups.indexOf(narration.logicalKey) + 1} · request ${siblings.findIndex((one) => one.key === row.key) + 1}`,
          text,
          settings:
            input.kind === "tts"
              ? [input.provider, input.model, input.voice].join(" · ")
              : "Provided audio",
        },
      ];
    }
    if (input.kind === "image") {
      const index = view.revision.content.imageOrder.indexOf(row.key.slice("image:".length));
      return [
        {
          key: row.key,
          label:
            row.key === "reference:image"
              ? "Establishing image"
              : row.key.startsWith("thumbnail:image:")
                ? `Thumbnail image ${row.key.slice("thumbnail:image:".length)}`
                : index < 0
                  ? "Thumbnail image"
                  : `Image ${index + 1}`,
          text: input.prompt,
          settings: [
            input.provider,
            input.model,
            ...(input.thinking === undefined ? [] : [`effort ${input.thinking}`]),
            input.aspect,
            ...(input.reference === undefined ? [] : ["drawn from the establishing image"]),
          ].join(" · "),
        },
      ];
    }
    if (input.kind === "llm") {
      const peers = allRecipes.filter((one) => one.stage === row.stage && one.input.kind === "llm");
      const category =
        input.preparation !== undefined
          ? "Narration Preparation"
          : row.key.startsWith("entry:intro")
            ? "Intro text"
            : row.key.startsWith("entry:outro")
              ? "Outro text"
              : row.stage === "article"
                ? "Article"
                : row.stage === "research"
                  ? "Research"
                  : row.key.startsWith("shorts:")
                    ? "Short image prompts"
                    : "Thumbnail prompt";
      return [
        {
          key: row.key,
          label: `${category} request ${peers.findIndex((one) => one.key === row.key) + 1}`,
          text: [
            ...input.messages.map((message) => `${message.role}:\n${message.content}`),
            ...(input.documents ?? []).map(
              (document) => `Document ${document.id}: ${document.title}\n${document.content}`,
            ),
          ].join("\n\n"),
          settings: [input.provider, input.model, input.thinking]
            .filter((value) => value !== null)
            .join(" · "),
        },
      ];
    }
    return [];
  });
  return { inputChanges: parent === undefined ? [] : inputChanges(parent, view), requests };
}

function loudnessSummary(value: LoudnessSettings): string {
  return `Video ${loudnessLabel(value.videoLufs, "video")}; audio files ${loudnessLabel(value.audioFilesLufs, "audioFiles")}`;
}

function narrationIdentity(
  row: ResolvedWorkRecipe,
): { logicalKey: string; segment: string } | undefined {
  if (row.input.kind === "tts")
    return { logicalKey: row.input.logicalKey, segment: row.input.segment };
  if (row.input.kind !== "provided") return undefined;
  const match = /^audio:(body:.+|intro|outro):[0-9]+$/.exec(row.key);
  if (match === null) return undefined;
  return {
    logicalKey: row.key.slice(0, row.key.lastIndexOf(":")),
    segment: row.key.startsWith("audio:body:")
      ? "body"
      : row.key.startsWith("audio:intro:")
        ? "intro"
        : "outro",
  };
}

function inputChanges(parent: RevisionView, view: RevisionView): Review["inputChanges"] {
  const before = parent.revision.config;
  const after = view.revision.config;
  const old = parent.revision.content;
  const next = view.revision.content;
  const changes: { label: string; before: string | null; after: string | null }[] = [];
  const add = (label: string, previous: unknown, current: unknown): void => {
    const text = (value: unknown): string | null =>
      value == null ? null : typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const a = text(previous);
    const b = text(current);
    if (a !== b) changes.push({ label, before: a, after: b });
  };
  add("Project title", before.title, after.title);
  add("Aspect ratio", before.format, after.format);
  for (const kind of stageKinds)
    add(
      `${kind[0]?.toUpperCase()}${kind.slice(1)} source`,
      sourceOf(before.sources, kind),
      sourceOf(after.sources, kind),
    );
  for (const [name, a, b] of [
    ["Text", before.llm, after.llm],
    ["Narration", before.audio, after.audio],
    ["Images", before.images, after.images],
  ] as const) {
    add(`${name} provider`, a?.provider, b?.provider);
    add(`${name} model`, a?.model, b?.model);
    add(`${name} thinking`, a?.thinking, b?.thinking);
  }
  add("Language", languageInfo(before.language).name, languageInfo(after.language).name);
  add("Narration voice", before.audio?.voice, after.audio?.voice);
  add("Narration Preparation", before.narrationPrompt, after.narrationPrompt);
  add("Narration chunking", before.chunking, after.chunking);
  add(
    "Narration aliases",
    before.audio?.useNarrationAliases === true ? aliasLines(before.narrationAliases) : "Off",
    after.audio?.useNarrationAliases === true ? aliasLines(after.narrationAliases) : "Off",
  );
  add(
    "Level the volume",
    before.loudness === undefined ? "Off" : loudnessSummary(before.loudness),
    after.loudness === undefined ? "Off" : loudnessSummary(after.loudness),
  );
  add(
    "YouTube description",
    before.youtubeDescription === true ? "On" : "Off",
    after.youtubeDescription === true ? "On" : "Off",
  );
  add("Description prompt", before.descriptionPrompt, after.descriptionPrompt);
  add(
    "Shorts",
    before.shorts?.enabled === true ? "On" : "Off",
    after.shorts?.enabled === true ? "On" : "Off",
  );
  add("Number of shorts", before.shorts?.count, after.shorts?.count);
  add(
    "Short length (seconds)",
    before.shorts === undefined
      ? undefined
      : `${String(before.shorts.minSeconds)}-${String(before.shorts.maxSeconds)}`,
    after.shorts === undefined
      ? undefined
      : `${String(after.shorts.minSeconds)}-${String(after.shorts.maxSeconds)}`,
  );
  add(
    "Thumbnails",
    before.thumbnailCount === 3 ? "3" : "1",
    after.thumbnailCount === 3 ? "3" : "1",
  );
  add("Shorts prompt", before.shorts?.prompt, after.shorts?.prompt);
  add("Shorts image prompt", before.shorts?.imagePrompt, after.shorts?.imagePrompt);
  add("Reviewer provider", before.reviews?.provider, after.reviews?.provider);
  add("Reviewer model", before.reviews?.model, after.reviews?.model);
  add("Reviewer redos", before.reviews?.retries, after.reviews?.retries);
  for (const stage of reviewStages) {
    add(
      `${reviewStageLabels[stage]} review`,
      reviewModeLabels[reviewModeOf(before.reviews, stage)],
      reviewModeLabels[reviewModeOf(after.reviews, stage)],
    );
    add(
      `${reviewStageLabels[stage]} review prompt`,
      before.reviews?.stages[stage]?.prompt,
      after.reviews?.stages[stage]?.prompt,
    );
  }
  add("Establishing image", referenceLabel(before), referenceLabel(after));
  add(
    "Thumbnail drawn from the establishing image",
    before.reference === undefined
      ? undefined
      : before.reference.thumbnail === false
        ? "Off"
        : "On",
    after.reference === undefined ? undefined : after.reference.thumbnail === false ? "Off" : "On",
  );
  add(
    "Title on the shorts",
    before.shorts === undefined ? undefined : before.shorts.titleOnScreen === true ? "On" : "Off",
    after.shorts === undefined ? undefined : after.shorts.titleOnScreen === true ? "On" : "Off",
  );
  add(
    "Shorts speed",
    before.shorts === undefined ? undefined : `${shortsSpeedOf(before.shorts).toFixed(2)}×`,
    after.shorts === undefined ? undefined : `${shortsSpeedOf(after.shorts).toFixed(2)}×`,
  );
  add(
    "Shorts music",
    old.shortsMusic === undefined ? "None" : "Uploaded file",
    next.shortsMusic === undefined
      ? "None"
      : next.shortsMusic === old.shortsMusic
        ? "Uploaded file"
        : "New uploaded file",
  );
  add(
    "Shorts music volume (%)",
    before.shorts === undefined ? undefined : musicVolumeOf(before.shorts),
    after.shorts === undefined ? undefined : musicVolumeOf(after.shorts),
  );
  add("Full video link", before.shorts?.fullVideoLink, after.shorts?.fullVideoLink);
  add("Short ranges set by hand", old.shortsRanges, next.shortsRanges);
  add("Silence gap (seconds)", before.silenceGapSeconds, after.silenceGapSeconds);
  add("Silence at start and end (seconds)", before.edgeSilenceSeconds, after.edgeSilenceSeconds);
  add("Ambient sound", ambientBedLabel(before, old), ambientBedLabel(after, next));
  add("Seconds per image", before.imageSeconds, after.imageSeconds);
  add("Zoom (%)", before.zoomPercent, after.zoomPercent);
  add("Motion", motionStyleLabels[before.motionStyle], motionStyleLabels[after.motionStyle]);
  // Row by row, so turning on grain says "Film grain: Off → Subtle" and nothing else.
  const editBefore = videoEditRows(videoEditOf(before));
  const editAfter = new Map(videoEditRows(videoEditOf(after)));
  for (const [label, value] of editBefore) add(label, value, editAfter.get(label));
  add("Intro", before.intro, after.intro);
  add("Outro", before.outro, after.outro);
  add("Subtitle settings", before.subtitles, after.subtitles);
  const themeBefore = documentThemeLabel(before.document);
  const themeAfter = documentThemeLabel(after.document);
  // A Library theme saved again under the same name still changes the document.
  add(
    "Document theme",
    themeBefore,
    themeBefore === themeAfter &&
      JSON.stringify(before.document?.custom?.values) !==
        JSON.stringify(after.document?.custom?.values)
      ? `${themeAfter} (updated settings)`
      : themeAfter,
  );
  add("Article text", parent.articleMarkdown, view.articleMarkdown);
  add("Provided research", before.provided.research, after.provided.research);
  for (const key of new Set([...Object.keys(before.values), ...Object.keys(after.values)]))
    add(`Keyword: ${key}`, before.values[key], after.values[key]);
  for (const key of new Set([...Object.keys(before.rendered), ...Object.keys(after.rendered)]))
    add(`Prompt: ${key}`, before.rendered[key], after.rendered[key]);
  if (old.imageOrder.join("\0") !== next.imageOrder.join("\0")) {
    const label = (key: string): string =>
      old.imageOrder.includes(key) ? `Image ${old.imageOrder.indexOf(key) + 1}` : "New image";
    add("Image order", old.imageOrder.map(label).join(", "), next.imageOrder.map(label).join(", "));
  }
  for (const [index, key] of next.imageOrder.entries()) {
    add(
      `Image ${index + 1} prompt`,
      old.imageDefinitions[key]?.prompt,
      next.imageDefinitions[key]?.prompt,
    );
    if (old.imageDefinitions[key]?.assetId !== next.imageDefinitions[key]?.assetId)
      add(
        `Image ${index + 1} file`,
        old.imageDefinitions[key]?.assetId == null ? null : "Previous file",
        next.imageDefinitions[key]?.assetId == null ? null : "Replacement file",
      );
  }
  add("Manual captions", old.subtitleCues?.cues, next.subtitleCues?.cues);
  return changes;
}

// The ambient bed in one line; undefined without one, so a project that never had one lists
// no change.
function ambientBedLabel(
  config: RunConfig,
  content: RevisionView["revision"]["content"],
): string | undefined {
  const bed = config.ambientBed;
  if (bed === undefined) return undefined;
  const file =
    bed.source === "upload" && content.ambientBed !== undefined ? " (uploaded file)" : "";
  return `${ambientBedLabels[bed.source]}${file}, ${String(bed.levelDb)} dB, fade in ${String(bed.fadeInSeconds)} s, tail ${String(bed.tailSeconds)} s`;
}

function referenceLabel(config: Pick<RunConfig, "reference">): string {
  const reference = config.reference;
  if (reference === undefined) return "Off";
  return reference.source === "provide" ? "Uploaded image" : `Prompt: ${reference.prompt ?? ""}`;
}

// One line per alias, as the Library shows it, so a changed alias reads as a changed line.
function aliasLines(aliases: RunConfig["narrationAliases"]): string {
  if (aliases === undefined || aliases.length === 0) return "On, no aliases copied";
  return aliases
    .map(
      (alias) =>
        `${alias.written} → ${alias.spoken}${alias.wholeWord ? "" : " (inside words too)"}${alias.caseSensitive ? " (match case)" : ""}`,
    )
    .join("\n");
}

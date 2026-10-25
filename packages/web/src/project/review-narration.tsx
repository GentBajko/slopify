import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import type { Output, OutputRole } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { type RefObject, use, useMemo, useRef } from "react";
import { useApp } from "@/app-context";
import type { PlayerChapter } from "@/components/kit/player";
import { narrationGroups, orderedGroups } from "./narration-editor.js";
import type { Passage } from "./narration-fix.js";
import { useOutdated } from "./output-change.js";
import { useOutputText } from "./parts.js";
import {
  chunkOfLine,
  chunkTexts,
  placeLine,
  type SpokenSegment,
  segmentStarts,
  type TimedLine,
  timedLines,
} from "./review-timing.js";
import { speakerNames, type TranscriptLine } from "./review-transcript.js";
import { RegenerateNowContext } from "./revision-action-context.js";
import { narrationChunkOrderOf } from "./revision-api.js";
import { useCurrentRevisionView } from "./revision-media.js";

type Refs = Readonly<Record<SpokenSegment, RefObject<HTMLAudioElement | null>>>;

export interface NarrationTiming {
  readonly refs: Refs;
  // Every line, each tied to the segment player it plays in; empty without current timing.
  readonly lines: readonly TranscriptLine[];
  // Where each passage starts, as marks on its segment's waveform.
  readonly marks: Readonly<Partial<Record<SpokenSegment, readonly PlayerChapter[]>>>;
  // Fix this line; absent outside a project with saved versions and while the page is busy.
  readonly fix?: NarrationFix | undefined;
}

// Fix this line: the passage a line was spoken in, and making it again, with corrected words
// or as it is.
export interface NarrationFix {
  readonly passageOf: (line: TranscriptLine) => Passage | undefined;
  readonly makeAgain: (passage: Passage, words: string) => void;
}

// What the narration is made of once a passage is made again: the outdated narration files,
// whose work reads the passage again and joins it with the others. The video keeps the current
// narration until it is made again.
const narrationRoles: ReadonlySet<OutputRole> = new Set<OutputRole>([
  "narration_txt",
  "tts_script",
  "glossary",
  "audio_body",
  "audio_intro",
  "audio_outro",
  "audio_levelled",
]);

// The saved version's change for one passage: the corrected words, or the same words read
// again (a file of the person's own for it goes, as the Narration editor's Make again does).
export function passageAgain(
  passage: Passage,
  words: string,
): (edit: RevisionEdit) => RevisionEdit {
  return (edit) => {
    const uploads = edit.uploads?.filter(
      (one) => one.destination.kind !== "narration" || one.destination.key !== passage.key,
    );
    const overrides = { ...edit.content.narrationOverrides };
    const kept = { ...edit, ...(uploads === undefined ? {} : { uploads }) };
    if (words.trim() !== passage.text.trim())
      return {
        ...kept,
        content: {
          ...edit.content,
          narrationOverrides: { ...overrides, [passage.key]: { kind: "text", text: words } },
        },
      };
    if (overrides[passage.key]?.kind === "asset") delete overrides[passage.key];
    return {
      ...kept,
      content: { ...edit.content, narrationOverrides: overrides },
      regenerate: [...new Set([...(edit.regenerate ?? []), passage.key])],
    };
  };
}

// The narration's passages in the order Edit settings → Narration numbers them, each with the
// words it says now and how many voice calls reading it takes, and the way to make one again.
// `remake` is absent outside a project with saved versions, for a narration that was supplied,
// and while the page is busy.
function useNarrationChunks(): {
  readonly chunks: readonly Passage[];
  readonly remake: ((passage: Passage, words: string) => void) | undefined;
} {
  const view = useCurrentRevisionView();
  const { api } = useApp();
  const regenerateNow = use(RegenerateNowContext);
  // The same query, and so the same spoken order, as the narration editor's.
  const order = useQuery({
    queryKey: ["narration-chunks", view?.revision.projectId, view?.revision.id],
    enabled: view !== undefined,
    queryFn: async () => {
      if (view === undefined) return null;
      const reply = await narrationChunkOrderOf(api, view.revision.projectId, view.revision.id);
      return reply.ok ? reply.value.chunks : null;
    },
    staleTime: Number.POSITIVE_INFINITY,
  }).data;
  return useMemo(() => {
    const groups = view === undefined ? [] : orderedGroups(narrationGroups(view).groups, order);
    const overrides = view?.revision.content.narrationOverrides ?? {};
    const chunks = groups.map((group) => {
      const override = overrides[group.key];
      return {
        key: group.key,
        text: override?.kind === "text" ? override.text : group.text,
        calls: group.parts,
        whole: groups.length === 1,
      };
    });
    const generated = view?.revision.config.sources.audio === "generate";
    return {
      chunks,
      remake:
        regenerateNow === undefined || !generated
          ? undefined
          : (passage: Passage, words: string) =>
              // Saved as a version, then started at once: the form named the voice calls and
              // said their price isn't known in advance.
              regenerateNow([], {
                change: passageAgain(passage, words),
                starts: (work) =>
                  work.outdated && work.role !== undefined && narrationRoles.has(work.role),
                unknownPrices: true,
                section: "narration",
              }),
    };
  }, [view, order, regenerateNow]);
}

// The caption timing (`subtitles.json`, made with the video) when it is current.
function useTimedLines(outputs: readonly Output[]): readonly TimedLine[] {
  const timing = outputs.find((output) => output.role === "subtitle_words");
  const stale = useOutdated(timing);
  const text = useOutputText(stale ? undefined : timing).data;
  return useMemo(() => timedLines(text), [text]);
}

// The Audio section's follow-along: the caption timing laid over the intro, body and outro
// players, so the narration text can be read in step with the audio and pressed to play from
// any line, with each chunk's start marked on its waveform.
export function useNarrationTiming(
  project: ProjectSummary,
  outputs: readonly Output[],
  played: readonly { readonly segment: SpokenSegment; readonly output: Output }[],
): NarrationTiming {
  const intro = useRef<HTMLAudioElement | null>(null);
  const body = useRef<HTMLAudioElement | null>(null);
  const outro = useRef<HTMLAudioElement | null>(null);
  const refs = useMemo(() => ({ intro, body, outro }), []);
  const timed = useTimedLines(outputs);
  const { chunks, remake } = useNarrationChunks();
  const config = project.config;
  const lengths = played
    .map(({ segment, output }) => `${segment}:${String(output.durationMs ?? 0)}`)
    .join(",");
  return useMemo(() => {
    const seconds: Partial<Record<SpokenSegment, number>> = {};
    for (const part of lengths.split(",")) {
      const [segment, ms] = part.split(":");
      const value = Number(ms) / 1000;
      if ((segment === "intro" || segment === "body" || segment === "outro") && value > 0)
        seconds[segment] = value;
    }
    const starts = segmentStarts({
      edgeSeconds: config.edgeSilenceSeconds,
      gapSeconds: config.silenceGapSeconds,
      seconds,
    });
    const speaker = speakerNames(config.voices?.speakers);
    const lines: TranscriptLine[] = [];
    const marks: Partial<Record<SpokenSegment, PlayerChapter[]>> = {};
    const chunkOf = new Map<string, number>();
    let lastChunk = -1;
    const texts = chunkTexts(chunks);
    if (starts !== undefined)
      for (const [index, line] of timed.entries()) {
        const placed = placeLine(line, starts, seconds);
        if (placed === undefined) continue;
        const key = `${placed.segment}-${String(index)}`;
        lines.push({
          key,
          text: line.text,
          start: placed.start,
          end: placed.end,
          shownAt: line.start,
          media: refs[placed.segment],
          speaker: speaker(line.speaker),
        });
        const chunk = chunkOfLine(texts, line.text, Math.max(0, lastChunk));
        if (chunk === undefined) continue;
        chunkOf.set(key, chunk);
        if (chunk !== lastChunk && chunks.length > 1) {
          const segmentMarks = marks[placed.segment] ?? [];
          segmentMarks.push({ start: placed.start, title: `Passage ${String(chunk + 1)}` });
          marks[placed.segment] = segmentMarks;
        }
        lastChunk = chunk;
      }
    const fix: NarrationFix | undefined =
      remake === undefined
        ? undefined
        : {
            passageOf: (line) => {
              const at = chunkOf.get(line.key);
              return at === undefined ? undefined : chunks[at];
            },
            makeAgain: remake,
          };
    return { refs, lines, marks, fix };
  }, [lengths, config, timed, chunks, remake, refs]);
}

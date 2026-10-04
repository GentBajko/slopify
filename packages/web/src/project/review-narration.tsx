import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { type RefObject, use, useMemo, useRef } from "react";
import { useApp } from "@/app-context";
import type { PlayerChapter } from "@/components/kit/player";
import { narrationGroups, orderedGroups } from "./narration-editor.js";
import { useOutdated } from "./output-change.js";
import { useOutputText } from "./parts.js";
import { focusPiece } from "./review-focus.js";
import {
  chunkOfLine,
  placeLine,
  type SpokenSegment,
  segmentStarts,
  type TimedLine,
  timedLines,
} from "./review-timing.js";
import { speakerNames, type TranscriptLine } from "./review-transcript.js";
import { EditRequestContext } from "./revision-action-context.js";
import { narrationChunkOrderOf } from "./revision-api.js";
import { useCurrentRevisionView } from "./revision-media.js";

type Refs = Readonly<Record<SpokenSegment, RefObject<HTMLAudioElement | null>>>;

export interface NarrationTiming {
  readonly refs: Refs;
  // Every line, each tied to the segment player it plays in; empty without current timing.
  readonly lines: readonly TranscriptLine[];
  // Where each narration chunk starts, as marks on its segment's waveform.
  readonly marks: Readonly<Partial<Record<SpokenSegment, readonly PlayerChapter[]>>>;
  // Opens Edit project → Narration at the chunk a line was spoken from; absent outside a
  // project with saved versions.
  readonly fix?: ((line: TranscriptLine) => void) | undefined;
}

// The narration chunks in the order Edit project → Narration numbers them, and the way to open
// that editor at one of them. `open` is absent outside a project with saved versions.
export function useNarrationChunks(): {
  readonly chunks: readonly { readonly key: string; readonly text: string }[];
  readonly open: ((chunk: number | undefined) => void) | undefined;
} {
  const view = useCurrentRevisionView();
  const { api } = useApp();
  const requestEdit = use(EditRequestContext);
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
    const chunks = view === undefined ? [] : orderedGroups(narrationGroups(view).groups, order);
    const generated = view?.revision.config.sources.audio === "generate";
    return {
      chunks,
      open:
        requestEdit === undefined || !generated
          ? undefined
          : (chunk: number | undefined) => {
              const target = chunk === undefined ? undefined : chunks[chunk];
              requestEdit({ section: "narration", change: (edit) => edit });
              focusPiece(target === undefined ? undefined : `narration:${target.key}`);
            },
    };
  }, [view, order, requestEdit]);
}

// The caption timing (`subtitles.json`, made with the video) when it is current.
export function useTimedLines(outputs: readonly Output[]): readonly TimedLine[] {
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
  const { chunks, open } = useNarrationChunks();
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
        const chunk = chunkOfLine(chunks, line.text, Math.max(0, lastChunk));
        if (chunk === undefined) continue;
        chunkOf.set(key, chunk);
        if (chunk !== lastChunk && chunks.length > 1) {
          const segmentMarks = marks[placed.segment] ?? [];
          segmentMarks.push({ start: placed.start, title: `Narration chunk ${String(chunk + 1)}` });
          marks[placed.segment] = segmentMarks;
        }
        lastChunk = chunk;
      }
    const fix =
      open === undefined ? undefined : (line: TranscriptLine) => open(chunkOf.get(line.key));
    return { refs, lines, marks, fix };
  }, [lengths, config, timed, chunks, open, refs]);
}

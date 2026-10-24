import { reportText } from "@app/slices/loudness/model.js";
import type { Chunking } from "@app/slices/narration/chunk.js";
import { defaultChunkCharacters, defaultChunkWords } from "@app/slices/narration/chunk.js";
import type { Output, OutputRole } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { type RefObject, useCallback, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button, ButtonRow } from "@/components/kit/button";
import { Fold } from "@/components/kit/fold";
import type { PlayerChapter } from "@/components/kit/player";
import { voicesQuery } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { LiveAudio } from "./live-audio.js";
import { narrationAudioFiles, narrationTextFiles, segmentNames } from "./narration-downloads.js";
import { NarrationText, useNarrationMarkdown } from "./narration-text.js";
import { useOutdated } from "./output-change.js";
import {
  DownloadMenu,
  EngravedLabel,
  lengthWords,
  MetaLine,
  OutputFolder,
  StageBody,
} from "./parts.js";
import { useReadOnlySample } from "./read-only.js";
import { useNarrationTiming } from "./review-narration.js";
import { ReviewVerdict, reviewFor, useReviews } from "./review-verdict.js";
import { useOutputMedia } from "./revision-media.js";
import { WaveAudioPlayer } from "./waveform.js";

// Narration: its player (one per part when it has an intro or an outro), then one row of
// actions — the recording, the text files, Copy the text and the stage's one Open folder —
// one line of facts in plain words, the technical details behind a fold, and the words
// themselves to read, search and follow. Historical voice metadata describes these files; the
// project's settings choose the voice for future work.
const players: readonly {
  readonly role: OutputRole;
  readonly segment: "intro" | "body" | "outro";
}[] = [
  { role: "audio_intro", segment: "intro" },
  { role: "audio_body", segment: "body" },
  { role: "audio_outro", segment: "outro" },
];

export function AudioBody({ stage, project, outputs, busy }: BodyProps) {
  const { api } = useApp();
  const voices = useQuery(voicesQuery(api));
  const reviews = useReviews(project.id);
  const mine = outputsOf(outputs, stage);
  // With Level the volume on, each segment plays its levelled join: what the video plays.
  const levelled = mine.filter((output) => output.role === "audio_levelled");
  const landed = players.flatMap((player) => {
    const plain = roleOf(mine, player.role);
    const output = levelled.find((one) => one.meta.segment === player.segment) ?? plain;
    return output === undefined
      ? []
      : [{ ...player, output, ...(plain === undefined || plain === output ? {} : { plain }) }];
  });
  const reports = players.flatMap((player) => {
    const report = levelled.find((one) => one.meta.segment === player.segment)?.meta.loudness;
    return report === undefined ? [] : [{ name: segmentNames[player.segment], report }];
  });
  const timing = useNarrationTiming(project, outputs, landed);
  const sample = useReadOnlySample(project.id);
  const markdown = useNarrationMarkdown(mine);
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const copy = useCallback((text: string, what: string) => {
    const failed = {
      text: `Couldn't copy the ${what}. Select the text and copy it.`,
      tone: "error" as const,
    };
    if (!navigator.clipboard) {
      setStatus(failed);
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => setStatus({ text: `Copied the ${what}.`, tone: "success" }),
      () => setStatus(failed),
    );
  }, []);
  const historical = landed.find((player) => player.output.meta.voice !== undefined)?.output.meta;
  const picked = landed.length > 0 ? historical?.voice : project.config.audio?.voice;
  const provider = landed.length > 0 ? historical?.provider : project.config.audio?.provider;
  const voice =
    voices.data?.voices.find((known) => known.voiceId === picked && known.provider === provider)
      ?.name ?? picked;
  const length = landed.reduce((sum, player) => sum + (player.output.durationMs ?? 0), 0);
  const facts = [
    voice === undefined ? undefined : `Voice ${voice}`,
    lengthWords(length),
    levelled.length > 0 ? "volume evened out" : undefined,
  ].filter((part) => part !== undefined);
  const parts = landed.length > 1;

  return (
    <StageBody>
      {stage.state === "running" ? <LiveAudio projectId={project.id} /> : null}
      {landed.length === 0 ? (
        <p className="m-0 text-small text-ink-2">No narration has landed yet.</p>
      ) : (
        landed.map((player) => (
          <Player
            key={player.role}
            name={parts ? segmentNames[player.segment] : undefined}
            output={player.output}
            audio={timing.refs[player.segment]}
            marks={timing.marks[player.segment] ?? []}
            {...(player.plain === undefined ? {} : { plain: player.plain })}
          />
        ))
      )}
      {landed.length === 0 && markdown === undefined ? null : (
        <ButtonRow>
          <DownloadMenu
            files={narrationAudioFiles(landed)}
            label={`Download narration (${String(landed.length)} parts)`}
          />
          <DownloadMenu
            files={narrationTextFiles(
              mine,
              outputs.find((output) => output.role === "script_md"),
            )}
            label="Download the text"
          />
          {markdown === undefined ? null : (
            <Button onClick={() => copy(markdown, "narration text")}>
              <CopyIcon aria-hidden="true" strokeWidth={1.75} />
              Copy the text
            </Button>
          )}
          <OutputFolder output={landed[0]?.output} />
          <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
        </ButtonRow>
      )}
      {facts.length === 0 ? null : <MetaLine>{facts.join(" · ")}</MetaLine>}
      <Fold summary="Technical details">
        <div className="mt-2 flex flex-col gap-1 text-small text-ink-2 tabular-nums">
          {reports.map(({ name, report }) => (
            <p key={name} className="m-0">
              {reports.length === 1 ? reportText(report) : `${name}: ${reportText(report)}`}
            </p>
          ))}
          <p className="m-0">{`Sent to the voice ${chunkingOf(project.config.chunking)}.`}</p>
        </div>
      </Fold>
      <ReviewVerdict
        review={reviewFor(reviews, { itemKey: "narration" })}
        projectId={project.id}
        busy={busy}
      />
      {/* A sample's narration is read and followed, never fixed: it cannot be changed. */}
      <NarrationText
        outputs={mine}
        timing={sample ? { ...timing, fix: undefined } : timing}
        onCopy={copy}
      />
    </StageBody>
  );
}

// A levelled narration that an edit outdated keeps playing until the run levels the new one,
// so the player says so, and plays the new narration as it is until then.
function Player({
  name,
  output,
  plain,
  audio,
  marks,
}: {
  // The part's name when the narration has several; none for a narration in one piece.
  readonly name: string | undefined;
  readonly output: Output;
  // The follow-along transcript plays and seeks this segment through it.
  readonly audio: RefObject<HTMLAudioElement | null>;
  // Where each narration chunk starts.
  readonly marks: readonly PlayerChapter[];
  // The segment's join before levelling, when `output` is its levelled copy.
  readonly plain?: Output;
}) {
  const media = useOutputMedia(output);
  const outdated = useOutdated(output);
  const newer = useOutdated(plain) || plain === undefined ? undefined : plain;
  const fresh = useOutputMedia(outdated ? newer : undefined);
  const label = name === undefined ? "Narration" : `${name} narration`;
  // The player shows the length itself once the file's metadata is read.
  return (
    <div
      className={
        name === undefined
          ? "flex flex-col gap-2 text-small"
          : "grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3 text-small"
      }
    >
      {name === undefined ? null : <EngravedLabel>{name}</EngravedLabel>}
      <WaveAudioPlayer
        ref={audio}
        label={label}
        src={media?.url}
        marks={marks}
        className="max-w-[720px]"
      />
      {outdated ? (
        <p
          className={
            name === undefined
              ? "m-0 text-small text-ink-2"
              : "col-start-2 m-0 text-small text-ink-2"
          }
        >
          {newer === undefined
            ? "Made before your last change: this is the narration from before it. The new one is made when the run carries on."
            : "Made before your last change: this is the evened-out narration from before it. The new narration is below as it was spoken; it is evened out when the run carries on."}
        </p>
      ) : null}
      {outdated && newer !== undefined ? (
        <>
          {name === undefined ? null : <EngravedLabel>New</EngravedLabel>}
          <WaveAudioPlayer
            label={`${label}, new, before evening out`}
            src={fresh?.url}
            className="max-w-[720px]"
          />
        </>
      ) : null}
    </div>
  );
}

// How the text was sent to the voice, in the words Create offered the choice in.
function chunkingOf(chunking: Chunking | undefined): string {
  if (chunking === undefined || chunking.mode === "whole") return "as one request";
  if (chunking.mode === "paragraph") return "one paragraph at a time";
  if (chunking.mode === "characters")
    return `every ${String(chunking.characters ?? defaultChunkCharacters)} characters`;
  return `every ${String(chunking.words ?? defaultChunkWords)} words`;
}

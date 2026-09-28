import { reportText } from "@app/slices/loudness/model.js";
import type { Chunking } from "@app/slices/narration/chunk.js";
import { defaultChunkCharacters, defaultChunkWords } from "@app/slices/narration/chunk.js";
import type { Output, OutputRole } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { Fact, Facts } from "@/components/kit/facts";
import { voicesQuery } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { LiveAudio } from "./live-audio.js";
import { hasNarrationText, narrationFiles } from "./narration-downloads.js";
import { NarrationText } from "./narration-text.js";
import { useOutdated } from "./output-change.js";
import { EngravedLabel, MetaLine, StageBody, StageFiles } from "./parts.js";
import { ReviewVerdict, reviewFor, useReviews } from "./review-verdict.js";
import { useOutputMedia } from "./revision-media.js";
import { WaveAudioPlayer } from "./waveform.js";

// Each completed segment keeps its player; every file (recordings, clean narration, TTS
// scripts) is in the stage's one Download menu beside its one Open folder. Historical voice metadata
// describes these files; the separate project controls choose providers for future work.
const players: readonly {
  readonly role: OutputRole;
  readonly segment: "intro" | "body" | "outro";
  readonly name: string;
}[] = [
  { role: "audio_intro", segment: "intro", name: "Intro" },
  { role: "audio_body", segment: "body", name: "Body" },
  { role: "audio_outro", segment: "outro", name: "Outro" },
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
    return report === undefined ? [] : [{ name: player.name, report }];
  });
  const historical = landed.find((player) => player.output.meta.voice !== undefined)?.output.meta;
  const picked = landed.length > 0 ? historical?.voice : project.config.audio?.voice;
  const provider = landed.length > 0 ? historical?.provider : project.config.audio?.provider;
  const voice =
    voices.data?.voices.find((known) => known.voiceId === picked && known.provider === provider)
      ?.name ?? picked;

  return (
    <StageBody>
      {stage.state === "running" ? <LiveAudio projectId={project.id} /> : null}
      {landed.length === 0 ? (
        <p className="m-0 text-small text-ink-2">No narration has landed yet.</p>
      ) : (
        landed.map((player) => (
          <Player
            key={player.role}
            name={player.name}
            output={player.output}
            {...(player.plain === undefined ? {} : { plain: player.plain })}
          />
        ))
      )}

      <StageFiles
        files={narrationFiles(
          mine,
          landed,
          outputs.find((output) => output.role === "script_md"),
        )}
      />
      {reports.length === 0 ? null : (
        <MetaLine>
          {reports
            .map(({ name, report }) =>
              reports.length === 1 ? reportText(report) : `${name}: ${reportText(report)}`,
            )
            .join(" ")}
        </MetaLine>
      )}

      <Facts label="How it was recorded">
        {voice === undefined ? null : <Fact label="Voice">{voice}</Fact>}
        <Fact label="Chunking">{capitalise(chunkingOf(project.config.chunking))}</Fact>
        {hasNarrationText(mine) ? (
          <Fact label="Text files">
            <span className="text-small text-ink-2">
              Clean narration is the spoken text used for captions. The TTS script adds delivery
              cues, with a blank line between requests. Uploaded audio has no TTS request.
            </span>
          </Fact>
        ) : null}
      </Facts>

      <ReviewVerdict
        review={reviewFor(reviews, { itemKey: "narration" })}
        projectId={project.id}
        busy={busy}
      />
      <NarrationText outputs={mine} />
    </StageBody>
  );
}

// A levelled narration that an edit outdated keeps playing until the run levels the new one,
// so the player says so, and plays the new narration as it is until then.
function Player({
  name,
  output,
  plain,
}: {
  readonly name: string;
  readonly output: Output;
  // The segment's join before levelling, when `output` is its levelled copy.
  readonly plain?: Output;
}) {
  const media = useOutputMedia(output);
  const outdated = useOutdated(output);
  const newer = useOutdated(plain) || plain === undefined ? undefined : plain;
  const fresh = useOutputMedia(outdated ? newer : undefined);
  // The player shows the length itself once the file's metadata is read.
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 text-small">
      <EngravedLabel>{name}</EngravedLabel>
      <WaveAudioPlayer label={`${name} narration`} src={media?.url} className="max-w-[640px]" />
      {outdated ? (
        <p className="col-start-2 m-0 text-small text-ink-2">
          {newer === undefined
            ? "Outdated: this is the narration from before your last change. The new one is made when the run carries on: press Continue the run, or Remake at the top of the page."
            : "Outdated: this is the levelled narration from before your last change. The new narration is below as it was spoken; it is levelled when the run carries on: press Continue the run, or Remake at the top of the page."}
        </p>
      ) : null}
      {outdated && newer !== undefined ? (
        <>
          <EngravedLabel>New</EngravedLabel>
          <WaveAudioPlayer
            label={`${name} narration, new, before levelling`}
            src={fresh?.url}
            className="max-w-[640px]"
          />
        </>
      ) : null}
    </div>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The chunking modes, in the words Play offered the choice in.
function chunkingOf(chunking: Chunking | undefined): string {
  if (chunking === undefined || chunking.mode === "whole") {
    return "the whole text as one request";
  }
  if (chunking.mode === "paragraph") {
    return "one request per paragraph";
  }
  if (chunking.mode === "characters")
    return `every ${String(chunking.characters ?? defaultChunkCharacters)} characters`;
  return `every ${String(chunking.words ?? defaultChunkWords)} words`;
}

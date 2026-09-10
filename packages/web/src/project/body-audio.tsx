import type { Chunking } from "@app/slices/narration/chunk.js";
import { defaultChunkCharacters, defaultChunkWords } from "@app/slices/narration/chunk.js";
import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output, OutputRole } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { voicesQuery } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { LiveAudio } from "./live-audio.js";
import { ActionRow, EngravedLabel, OutputDownload, StageBody } from "./parts.js";
import { duration } from "./summary.js";

// Each completed segment keeps its player and download. Historical voice metadata
// describes these files; the separate project controls choose providers for future work.
const players: readonly { readonly role: OutputRole; readonly name: string }[] = [
  { role: "audio_intro", name: "Intro" },
  { role: "audio_body", name: "Body" },
  { role: "audio_outro", name: "Outro" },
];

export function AudioBody({ stage, project, outputs, actions, busy }: BodyProps) {
  const { api } = useApp();
  const voices = useQuery(voicesQuery(api));
  const mine = outputsOf(outputs, stage);
  const landed = players.flatMap((player) => {
    const output = roleOf(mine, player.role);
    return output === undefined ? [] : [{ ...player, output }];
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
        <p className="text-small text-ink2">No narration has landed yet.</p>
      ) : (
        landed.map((player) => (
          <Player key={player.role} name={player.name} output={player.output} />
        ))
      )}

      <ActionRow>
        <ConfirmedButton
          action={{ kind: "rerun", stage: stage.kind }}
          run={() => {
            actions.run({ kind: "rerun", stage: stage.kind });
          }}
          disabled={busy}
          pending={actions.pending}
        >
          Re-run
        </ConfirmedButton>
        {voice === undefined ? null : (
          <>
            <EngravedLabel>Voice</EngravedLabel>
            <span className="text-small text-ink">{voice}</span>
          </>
        )}
        <span className="text-small text-ink2">{`Chunking: ${chunkingOf(project.config.chunking)}`}</span>
      </ActionRow>
    </StageBody>
  );
}

function Player({ name, output }: { readonly name: string; readonly output: Output }) {
  const { api } = useApp();
  const length = duration(output.durationMs ?? undefined);
  return (
    <div className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 text-small">
      <EngravedLabel>{name}</EngravedLabel>
      {/* biome-ignore lint/a11y/useMediaCaption: this is the user's own narration of their
          own article, and no caption track exists for it anywhere in the pipeline. */}
      <audio
        controls
        preload="metadata"
        aria-label={`${name} narration`}
        src={fileUrl(api, output.projectId, assetOf(output))}
        className="h-8 w-full max-w-[520px]"
      />
      <span className="flex items-center gap-4">
        {length === undefined ? null : <span className="text-ink2 tabular-nums">{length}</span>}
        <OutputDownload output={output} />
      </span>
    </div>
  );
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

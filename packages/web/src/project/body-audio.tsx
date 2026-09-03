import type { Chunking } from "@app/slices/narration/chunk.js";
import { defaultChunkWords } from "@app/slices/narration/chunk.js";
import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output, OutputRole } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { voicesQuery } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { ActionRow, EngravedLabel, OutputDownload, StageBody } from "./parts.js";
import { duration } from "./summary.js";

// "Audio: three players when intro or outro exist (Intro, Body, Outro) with durations;
// Download each; Re-run with a Voice select beside it; Chunking shown as text"
// (uiux/screens/08-project.md).
//
// ceiling: the Voice is shown, not picked. `edge/http/actions.ts` re-runs a stage from the
// project's stored configuration and takes no body, so a voice chosen here would have
// nowhere to go; the upgrade is a payload on the re-run route that overwrites
// `config.audio.voice` before the stage restarts.
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
  const picked = project.config.audio?.voice;
  const voice =
    voices.data?.voices.find((known) => known.voiceId === picked)?.name ?? picked ?? "the run's";

  return (
    <StageBody>
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
        <EngravedLabel>Voice</EngravedLabel>
        <span className="text-small text-ink">{voice}</span>
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

// `logic/08` §Q65, said in the words Play offered the choice in.
function chunkingOf(chunking: Chunking | undefined): string {
  if (chunking === undefined || chunking.mode === "whole") {
    return "the whole text as one request";
  }
  if (chunking.mode === "paragraph") {
    return "one request per paragraph";
  }
  return `every ${String(chunking.words ?? defaultChunkWords)} words`;
}

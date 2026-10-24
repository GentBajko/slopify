import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { FileLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { MediaFrame } from "@/components/kit/media";
import { Player } from "@/components/kit/player";
import { startedAt } from "@/lib/utils";
import { Stamp } from "@/library/time";
import { keys } from "@/queries";
import { OpenFolder } from "./open-folder.js";
import { outputLabel } from "./output-label.js";
import { outputStateWords } from "./output-status.js";
import {
  type AgentActionView,
  historyOf,
  revisionFileUrl,
  revisionImagesUrl,
  viewOf,
} from "./revision-api.js";
import { WaveAudioPlayer } from "./waveform.js";

const retainedTextSchema = z.object({
  text: z.string().optional(),
  logicalText: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  outline: z.array(z.string()).optional(),
  prompt: z.string().optional(),
});
function retainedText(raw: string | null): string {
  if (raw === null) return "No text was recorded for this part.";
  try {
    const parsed = retainedTextSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return "Recorded text cannot be decoded.";
    const { logicalText, text, title, notes, outline, prompt } = parsed.data;
    const chapter = notes?.trim()
      ? [title, notes].filter((part) => part?.trim()).join("\n\n")
      : undefined;
    const chapters = outline
      ?.filter((part) => part.trim())
      .map((part, index) => `${index + 1}. ${part}`)
      .join("\n");
    return (
      [logicalText, text, chapter, chapters, prompt].find((part) => part?.trim()) ??
      "No text was recorded for this part."
    );
  } catch {
    return "Recorded text cannot be decoded.";
  }
}

// Versions: every save of the settings is a version. With one there is one line saying so;
// with several, a row each, newest first, with Restore on every row but the current one and
// its files a press away.
export function RevisionHistory({
  projectId,
  pending,
  onRestore,
}: {
  readonly projectId: string;
  readonly pending: boolean;
  readonly onRestore: (revisionId: string) => void;
}): import("react").ReactElement {
  const { api } = useApp();
  const [selected, setSelected] = useState<string | undefined>();
  const [restoring, setRestoring] = useState<{ id: string; number: number } | undefined>();
  const history = useQuery({
    queryKey: keys.revisions(projectId),
    queryFn: async () => {
      const result = await historyOf(api, projectId);
      if (!result.ok) throw new Error(result.message);
      return result.value;
    },
  });
  // Numbered in the order they were saved; shown newest first.
  const versions = (history.data?.revisions ?? [])
    .toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map((revision, at) => ({ revision, number: at + 1 }))
    .reverse();
  const count = versions.length;
  const only = count === 1 && versions[0]?.revision.current === true ? versions[0] : undefined;
  const toggle = (id: string) => setSelected((open) => (open === id ? undefined : id));
  const by = (revision: (typeof versions)[number]["revision"]): string =>
    revision.byAgent === true
      ? " · by agent"
      : revision.byAssistant === true
        ? " · by assistant"
        : "";
  return (
    <section aria-label="Versions" className="flex flex-col gap-3">
      {history.error === null ? null : <p role="alert">{history.error.message}</p>}
      {count === 0 ? null : only !== undefined ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="m-0 text-small text-ink-2">
            One version, saved{" "}
            <Stamp iso={only.revision.createdAt}>{startedAt(only.revision.createdAt)}</Stamp>
            {by(only.revision)}. Saving a change to these settings adds a version here.
          </p>
          <FilesToggle
            open={selected === only.revision.id}
            onToggle={() => toggle(only.revision.id)}
          />
        </div>
      ) : (
        <List label="Versions">
          {versions.map(({ revision, number }) => (
            <ListRow
              key={revision.id}
              title={`Version ${String(number)}`}
              meta={
                <>
                  {revision.title} · saved{" "}
                  <Stamp iso={revision.createdAt}>{startedAt(revision.createdAt)}</Stamp>
                  {by(revision)}
                  {revision.current ? " · Current" : ""}
                </>
              }
              actions={
                <ButtonRow>
                  {revision.current ? null : (
                    <Button
                      size="small"
                      disabled={pending}
                      disabledReason="Wait until the open change or remake is done"
                      onClick={() => setRestoring({ id: revision.id, number })}
                    >
                      Restore
                    </Button>
                  )}
                  <FilesToggle
                    open={selected === revision.id}
                    onToggle={() => toggle(revision.id)}
                  />
                </ButtonRow>
              }
            >
              {selected === revision.id ? (
                <VersionFiles projectId={projectId} revisionId={revision.id} />
              ) : null}
            </ListRow>
          ))}
        </List>
      )}
      {only !== undefined && selected === only.revision.id ? (
        <VersionFiles projectId={projectId} revisionId={only.revision.id} />
      ) : null}
      {(history.data?.agentActions.length ?? 0) === 0 ? null : (
        <section aria-label={doneByTitle(history.data?.agentActions ?? [])} className="space-y-1">
          <h3 className="m-0 text-title-3">{doneByTitle(history.data?.agentActions ?? [])}</h3>
          <ul className="m-0 list-none space-y-1 p-0 text-small text-ink-2">
            {history.data?.agentActions.map((action) => (
              <li key={action.id}>
                {action.title} · by {action.actor} ·{" "}
                <Stamp iso={action.createdAt}>{startedAt(action.createdAt)}</Stamp>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ConfirmDialog
        open={restoring !== undefined}
        tone="primary"
        title={restoring === undefined ? "" : `Restore version ${String(restoring.number)}?`}
        consequence={`The settings go back to that version's, saved as version ${String(count + 1)}; the current ones stay in the list. Nothing is made again until you choose to.`}
        confirmLabel={
          restoring === undefined ? "Restore" : `Restore version ${String(restoring.number)}`
        }
        cancelLabel="Keep the current settings"
        pending={pending}
        onConfirm={() => {
          const target = restoring;
          setRestoring(undefined);
          if (target !== undefined) onRestore(target.id);
        }}
        onCancel={() => setRestoring(undefined)}
      />
    </section>
  );
}

function FilesToggle({
  open,
  onToggle,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
}): import("react").ReactElement {
  return (
    <Button variant="quiet" size="small" aria-expanded={open} onClick={onToggle}>
      {open ? "Hide its files" : "Show its files"}
    </Button>
  );
}

// One version's files: its images as one download and its one Open folder, then each file with
// its download and a preview, and the narration and text parts it kept.
function VersionFiles({
  projectId,
  revisionId,
}: {
  readonly projectId: string;
  readonly revisionId: string;
}): import("react").ReactElement {
  const { api } = useApp();
  const view = useQuery({
    queryKey: keys.revision(projectId, revisionId),
    queryFn: async () => {
      const result = await viewOf(api, projectId, revisionId);
      if (!result.ok) throw new Error(result.message);
      return result.value.view;
    },
  });
  const selectedView = view.data;
  if (view.error !== null) return <p role="alert">{view.error.message}</p>;
  if (selectedView === undefined) return <p className="m-0 text-small text-ink-2">Loading…</p>;
  const zipImage = selectedView.outputs.find(
    (output) =>
      output.selected &&
      output.available &&
      (output.output.role === "image" || output.output.role === "thumbnail"),
  );
  const versionWhen = startedAt(selectedView.revision.createdAt);
  // The version's folder: the one its images are in, else its first saved file's.
  const folderOf = zipImage ?? selectedView.outputs.find((output) => output.available);
  return (
    <div className="space-y-3 pt-2">
      <ButtonRow>
        {zipImage === undefined ? null : (
          <FileLink href={revisionImagesUrl(api, projectId, selectedView.revision.id)} download>
            <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
            {selectedView.current ? "Download all images" : "Download this version's images"}
          </FileLink>
        )}
        {folderOf === undefined ? null : (
          <OpenFolder
            projectId={projectId}
            asset=""
            folder={{ revisionId: selectedView.revision.id, recordId: folderOf.recordId }}
          />
        )}
      </ButtonRow>
      <ul className="m-0 list-none space-y-3 p-0">
        {selectedView.outputs.map((output) => (
          <li
            key={output.recordId}
            className="space-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="min-w-0">
                <span className="font-semibold text-ink">{outputLabel(output.output)}</span>
                <span className="text-small text-ink-2">
                  {` · ${output.selected ? outputStateWords(output.state, output.output.role, output.available) : "Earlier result"}`}
                </span>
              </span>
              {output.available ? (
                <FileLink
                  href={revisionFileUrl(api, projectId, selectedView.revision.id, output.recordId)}
                  download
                  size="small"
                  aria-label={`Download ${outputLabel(output.output)} from the version of ${versionWhen}`}
                >
                  <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                  {selectedView.current ? "Download" : "Download this version"}
                </FileLink>
              ) : null}
            </div>
            {output.available ? (
              <details>
                <summary>Preview retained output</summary>
                {output.output.role === "video" ? (
                  <Player
                    className="max-w-[640px]"
                    label={outputLabel(output.output)}
                    src={revisionFileUrl(api, projectId, selectedView.revision.id, output.recordId)}
                  />
                ) : ["audio_export", "audio_body", "audio_intro", "audio_outro"].includes(
                    output.output.role,
                  ) ? (
                  <WaveAudioPlayer
                    label={outputLabel(output.output)}
                    src={revisionFileUrl(api, projectId, selectedView.revision.id, output.recordId)}
                  />
                ) : output.output.role === "image" || output.output.role === "thumbnail" ? (
                  <MediaFrame
                    className="max-w-[480px]"
                    alt={outputLabel(output.output)}
                    title={outputLabel(output.output)}
                    meta={output.selected ? "Current" : "Earlier result"}
                    src={revisionFileUrl(api, projectId, selectedView.revision.id, output.recordId)}
                  />
                ) : (
                  <p>Use Download to inspect this retained file.</p>
                )}
              </details>
            ) : null}
          </li>
        ))}
      </ul>
      <ul aria-label="Retained narration parts">
        {selectedView.pieces
          .filter((piece) => piece.stageKind === "audio" && piece.assetId !== null)
          .map((piece) => (
            <li key={piece.recordId}>
              Narration part {piece.piece.idx}
              {piece.selected ? "" : " · Earlier result"}
              {piece.available ? (
                <details>
                  <summary>Preview retained audio part</summary>
                  <WaveAudioPlayer
                    label={`Narration part ${String(piece.piece.idx)}`}
                    src={revisionFileUrl(api, projectId, selectedView.revision.id, piece.recordId)}
                  />
                  <FileLink
                    href={revisionFileUrl(api, projectId, selectedView.revision.id, piece.recordId)}
                    download
                    size="small"
                  >
                    <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                    Download narration part
                  </FileLink>
                </details>
              ) : (
                <span> · File missing</span>
              )}
            </li>
          ))}
      </ul>
      <ul aria-label="Retained text parts">
        {selectedView.pieces
          .filter((piece) => piece.assetId === null)
          .map((piece) => (
            <li key={piece.recordId}>
              <details>
                <summary>
                  {piece.stageKind} part {piece.piece.idx}
                </summary>
                <pre className="whitespace-pre-wrap break-words">
                  {retainedText(piece.piece.payload)}
                </pre>
              </details>
            </li>
          ))}
      </ul>
    </div>
  );
}

function doneByTitle(actions: readonly AgentActionView[]): string {
  const agents = actions.some((action) => action.actor === "agent");
  const assistant = actions.some((action) => action.actor === "assistant");
  if (agents && assistant) return "Done by agents and the assistant";
  return assistant ? "Done by the assistant" : "Done by agents";
}

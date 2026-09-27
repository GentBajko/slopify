import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useApp } from "@/app-context";
import { AudioPlayer } from "@/components/kit/audio-player";
import { Button, ButtonRow } from "@/components/kit/button";
import { FileLink } from "@/components/kit/link";
import { MediaFrame } from "@/components/kit/media";
import { Player } from "@/components/kit/player";
import { SectionHead } from "@/components/kit/section-head";
import { keys } from "@/queries";
import { OpenFolder } from "./open-folder.js";
import { outputLabel } from "./output-label.js";
import { historyOf, revisionFileUrl, revisionImagesUrl, viewOf } from "./revision-api.js";

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
  const history = useQuery({
    queryKey: keys.revisions(projectId),
    queryFn: async () => {
      const result = await historyOf(api, projectId);
      if (!result.ok) throw new Error(result.message);
      return result.value.revisions;
    },
  });
  const view = useQuery({
    queryKey: keys.revision(projectId, selected ?? ""),
    enabled: selected !== undefined,
    queryFn: async () => {
      if (selected === undefined) throw new Error("Choose a version from History first.");
      const result = await viewOf(api, projectId, selected);
      if (!result.ok) throw new Error(result.message);
      return result.value.view;
    },
  });
  const selectedView = view.data;
  const zipImage = selectedView?.outputs.find(
    (output) =>
      output.selected &&
      output.available &&
      (output.output.role === "image" || output.output.role === "thumbnail"),
  );
  // The version's folder: the one its images are in, else its first saved file's.
  const folderOf = zipImage ?? selectedView?.outputs.find((output) => output.available);
  return (
    <section aria-label="Project history" className="space-y-3">
      <SectionHead title="Project history" />
      {history.error === null ? null : <p role="alert">{history.error.message}</p>}
      <ol className="space-y-2">
        {history.data?.map((revision) => (
          <li key={revision.id}>
            <Button type="button" onClick={() => setSelected(revision.id)}>
              {revision.title} · {revision.createdAt}
              {revision.current ? " · Current" : ""}
            </Button>
          </li>
        ))}
      </ol>
      {view.error === null ? null : <p role="alert">{view.error.message}</p>}
      {selectedView === undefined ? null : (
        <div className="space-y-3">
          <h3 className="m-0 text-title-3">{selectedView.revision.config.title}</h3>
          {/* The version's actions in one row: Restore is the main one, then its images as
              one download and its ONE Open folder, never a folder button per file. */}
          <ButtonRow>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => onRestore(selectedView.revision.id)}
            >
              Restore this revision
            </Button>
            {zipImage === undefined ? null : (
              <FileLink href={revisionImagesUrl(api, projectId, selectedView.revision.id)} download>
                <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                Download all images
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
                      {` · ${output.state}${output.selected ? "" : " · Earlier result"}`}
                      {output.available ? "" : " · File missing"}
                    </span>
                  </span>
                  {output.available ? (
                    <FileLink
                      href={revisionFileUrl(
                        api,
                        projectId,
                        selectedView.revision.id,
                        output.recordId,
                      )}
                      download
                      size="small"
                      aria-label={`Download ${outputLabel(output.output)}`}
                    >
                      <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                      Download
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
                        src={revisionFileUrl(
                          api,
                          projectId,
                          selectedView.revision.id,
                          output.recordId,
                        )}
                      />
                    ) : ["audio_export", "audio_body", "audio_intro", "audio_outro"].includes(
                        output.output.role,
                      ) ? (
                      <AudioPlayer
                        label={outputLabel(output.output)}
                        src={revisionFileUrl(
                          api,
                          projectId,
                          selectedView.revision.id,
                          output.recordId,
                        )}
                      />
                    ) : output.output.role === "image" || output.output.role === "thumbnail" ? (
                      <MediaFrame
                        className="max-w-[480px]"
                        alt={outputLabel(output.output)}
                        title={outputLabel(output.output)}
                        meta={output.selected ? "Current" : "Earlier result"}
                        src={revisionFileUrl(
                          api,
                          projectId,
                          selectedView.revision.id,
                          output.recordId,
                        )}
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
                      <AudioPlayer
                        label={`Narration part ${String(piece.piece.idx)}`}
                        src={revisionFileUrl(
                          api,
                          projectId,
                          selectedView.revision.id,
                          piece.recordId,
                        )}
                      />
                      <FileLink
                        href={revisionFileUrl(
                          api,
                          projectId,
                          selectedView.revision.id,
                          piece.recordId,
                        )}
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
      )}
    </section>
  );
}

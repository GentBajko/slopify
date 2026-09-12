import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
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
      if (selected === undefined) throw new Error("Choose a revision.");
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
  return (
    <section
      aria-label="Project history"
      className="space-y-3 rounded-panel border border-line bg-panel p-4"
    >
      <h2>Project history</h2>
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
          <h3>{selectedView.revision.config.title}</h3>
          {zipImage === undefined ? null : (
            <span className="inline-flex gap-3">
              <a href={revisionImagesUrl(api, projectId, selectedView.revision.id)} download>
                Download all images
              </a>
              <OpenFolder
                projectId={projectId}
                asset=""
                folder={{ revisionId: selectedView.revision.id, recordId: zipImage.recordId }}
              />
            </span>
          )}
          <ul className="space-y-3">
            {selectedView.outputs.map((output) => (
              <li
                key={output.recordId}
                className="space-y-2 rounded-control border border-line p-3"
              >
                {outputLabel(output.output)} · {output.state}
                {output.selected ? "" : " · Earlier result"}:{" "}
                {output.available ? (
                  <a
                    href={revisionFileUrl(
                      api,
                      projectId,
                      selectedView.revision.id,
                      output.recordId,
                    )}
                  >
                    Download
                  </a>
                ) : (
                  "File missing"
                )}
                {output.available ? (
                  <OpenFolder
                    projectId={projectId}
                    asset=""
                    folder={{ revisionId: selectedView.revision.id, recordId: output.recordId }}
                  />
                ) : null}
                {output.available ? (
                  <details>
                    <summary>Preview retained output</summary>
                    {output.output.role === "video" ? (
                      // biome-ignore lint/a11y/useMediaCaption: retained revisions may predate subtitles; their original files remain inspectable.
                      <video
                        className="max-h-[480px] max-w-full"
                        controls
                        preload="metadata"
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
                      // biome-ignore lint/a11y/useMediaCaption: retained narration parts have no individual caption track.
                      <audio
                        className="max-w-full"
                        controls
                        preload="metadata"
                        src={revisionFileUrl(
                          api,
                          projectId,
                          selectedView.revision.id,
                          output.recordId,
                        )}
                      />
                    ) : output.output.role === "image" || output.output.role === "thumbnail" ? (
                      <img
                        className="max-h-[480px] max-w-full object-contain"
                        alt={outputLabel(output.output)}
                        loading="lazy"
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
                      {/* biome-ignore lint/a11y/useMediaCaption: retained narration parts have no individual caption track. */}
                      <audio
                        className="max-w-full"
                        controls
                        preload="metadata"
                        src={revisionFileUrl(
                          api,
                          projectId,
                          selectedView.revision.id,
                          piece.recordId,
                        )}
                      />
                      <a
                        href={revisionFileUrl(
                          api,
                          projectId,
                          selectedView.revision.id,
                          piece.recordId,
                        )}
                      >
                        Download narration part
                      </a>
                      <OpenFolder
                        projectId={projectId}
                        asset=""
                        folder={{ revisionId: selectedView.revision.id, recordId: piece.recordId }}
                      />
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
          <Button
            type="button"
            disabled={pending}
            onClick={() => onRestore(selectedView.revision.id)}
          >
            Restore this revision
          </Button>
        </div>
      )}
    </section>
  );
}

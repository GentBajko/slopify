import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { useApp } from "@/app-context";
import { keys } from "@/queries";
import { OpenFolder } from "./open-folder.js";
import { historyOf, revisionFileUrl, revisionImagesUrl, viewOf } from "./revision-api.js";

const retainedTextSchema = z.object({
  text: z.string().optional(),
  logicalText: z.string().optional(),
});
function retainedText(raw: string | null): string {
  if (raw === null) return "No text was recorded for this part.";
  try {
    const parsed = retainedTextSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? (parsed.data.logicalText ?? parsed.data.text ?? "No text was recorded for this part.")
      : "Recorded text cannot be decoded.";
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
    <section aria-label="Project history" className="space-y-3">
      <h2>Project history</h2>
      {history.error === null ? null : <p role="alert">{history.error.message}</p>}
      <ol>
        {history.data?.map((revision) => (
          <li key={revision.id}>
            <button type="button" onClick={() => setSelected(revision.id)}>
              {revision.title} · {revision.createdAt}
              {revision.current ? " · Current" : ""}
            </button>
          </li>
        ))}
      </ol>
      {view.error === null ? null : <p role="alert">{view.error.message}</p>}
      {selectedView === undefined ? null : (
        <div>
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
          <ul>
            {selectedView.outputs.map((output) => (
              <li key={output.recordId}>
                {output.slot} · {output.state}
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
                        alt={output.slot}
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
          <button
            type="button"
            disabled={pending}
            onClick={() => onRestore(selectedView.revision.id)}
          >
            Restore this revision
          </button>
        </div>
      )}
    </section>
  );
}

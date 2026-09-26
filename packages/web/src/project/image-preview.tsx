import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { useApp } from "@/app-context";
import { revisionFileUrl } from "./revision-api.js";

export function ImagePreview({
  edit,
  view,
  imageKey,
  index,
}: {
  readonly edit: RevisionEdit;
  readonly view: RevisionView | undefined;
  readonly imageKey: string;
  readonly index: number;
}): import("react").ReactElement | null {
  const { api } = useApp();
  const definition = edit.content.imageDefinitions[imageKey];
  if (definition === undefined) return null;
  const images =
    view?.outputs.filter(
      (row) => row.output.stageKind === "images" && row.output.role === "image",
    ) ?? [];
  const selected = images.find((row) => row.selected && row.workKey === `image:${imageKey}`);
  const staged =
    edit.uploads?.some(
      (upload) => upload.destination.kind === "image" && upload.destination.imageKey === imageKey,
    ) ?? false;
  const retained =
    definition.source === "generate" || staged
      ? selected
      : selected?.assetId === definition.assetId
        ? selected
        : images.find((row) => row.assetId === definition.assetId && row.available);
  const available = retained?.available === true;
  const missing =
    !available &&
    (retained !== undefined || (definition.source === "provide" && definition.assetId !== null));
  const status = staged
    ? available
      ? "Replacement ready to save; previous image shown until Save"
      : "Replacement ready to save; preview available after Save"
    : missing
      ? "Image file unavailable"
      : !available
        ? "No completed image yet"
        : definition.source === "provide" && retained !== selected
          ? "Provided image selected"
          : retained.state === "review"
            ? "Image retained; review required"
            : retained.state === "outdated"
              ? "Outdated image retained until rebuilt"
              : "Current image retained";
  // An uploaded clip plays in the image's place; it is shown as the muted clip it will be.
  const clip = available && /\.(mp4|mov|m4v|webm|mkv)$/i.test(retained.output.path);
  return (
    <>
      {!available || view === undefined ? null : clip ? (
        <video
          className="max-h-32 rounded-control object-contain"
          aria-label={`Video clip ${index + 1}`}
          muted
          loop
          controls
          preload="metadata"
          src={revisionFileUrl(api, view.revision.projectId, view.revision.id, retained.recordId)}
        />
      ) : (
        <img
          className="max-h-32 rounded-control object-contain"
          alt={`Retained scene ${index + 1}`}
          src={revisionFileUrl(api, view.revision.projectId, view.revision.id, retained.recordId)}
        />
      )}
      <p>{clip ? `${status} · video clip, played muted` : status}</p>
    </>
  );
}

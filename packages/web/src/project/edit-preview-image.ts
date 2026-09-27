import { castMentions } from "@app/slices/channels/cast-match.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import type { StylePreviewImage } from "@app/slices/style-preview/schema.js";
import type { CastMember } from "@/channels/api";

// The picture Edit project's style preview is drawn on, as Play's is (`play/preview-image.ts`):
// the establishing image the project already has (its saved output), else a picture of the
// cast member the title names, else the first cast member with one. Undefined keeps the
// sample stills.
export function editPreviewImageOf(
  view: RevisionView,
  edit: RevisionEdit,
  cast: readonly CastMember[],
): { readonly image: StylePreviewImage; readonly drawnOn: string } | undefined {
  const reference = view.outputs.find(
    (row) => row.selected && row.available && row.output.role === "reference",
  );
  if (edit.config.reference !== undefined && reference !== undefined)
    return {
      image: { kind: "output", outputId: reference.output.id },
      drawnOn: "the establishing image",
    };
  const pictured = cast.flatMap((member) => {
    const ready = member.images.find((image) => image.state === "ready" && image.sha256 !== null);
    return ready?.sha256 ? [{ ...member, images: [ready.sha256] }] : [];
  });
  const text = [edit.config.title, ...Object.values(edit.config.values ?? {})].join(" ");
  const chosen = castMentions(text, pictured)[0] ?? pictured[0];
  const sha256 = chosen?.images[0];
  if (chosen === undefined || sha256 === undefined) return undefined;
  return { image: { kind: "picture", sha256 }, drawnOn: `${chosen.name}'s picture` };
}

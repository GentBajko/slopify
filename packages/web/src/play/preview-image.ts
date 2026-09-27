import { castMentions } from "@app/slices/channels/cast-match.js";
import type { StylePreviewImage } from "@app/slices/style-preview/schema.js";
import type { CastMember } from "@/channels/api";
import type { PlayFormState } from "./state";

// The picture Play's style preview is drawn on, so the Look and captions are judged on
// something like the real images: the establishing image the draft uploaded (a template's
// comes along with it), else a picture of the cast member the title names, else the first cast
// member with one. Undefined keeps the sample stills.
export function previewImageOf(
  form: PlayFormState,
  cast: readonly CastMember[],
): { readonly image: StylePreviewImage; readonly drawnOn: string } | undefined {
  const upload = form.provided.reference?.file;
  if (
    form.sources.images === "generate" &&
    form.reference?.source === "provide" &&
    upload !== undefined
  )
    return {
      image: { kind: "upload", stagedFileId: upload.id },
      drawnOn: "the establishing image",
    };
  const pictured = cast.flatMap((member) => {
    const ready = member.images.find((image) => image.state === "ready" && image.sha256 !== null);
    return ready?.sha256 ? [{ ...member, images: [ready.sha256] }] : [];
  });
  const text = [form.title, ...Object.values(form.values)].join(" ");
  const chosen = castMentions(text, pictured)[0] ?? pictured[0];
  const sha256 = chosen?.images[0];
  if (chosen === undefined || sha256 === undefined) return undefined;
  return { image: { kind: "picture", sha256 }, drawnOn: `${chosen.name}'s picture` };
}

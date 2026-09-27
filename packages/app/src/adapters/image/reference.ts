import type { GeneratedImage, ImageRequest } from "../../kernel/ports/image.js";

// What an image API is told about the establishing image sent with a request, ahead of the
// brief. An edit endpoint otherwise treats its input as the picture to change, so it says the
// input is a reference for the look and the cast, not the composition to keep.
export const referenceNote =
  "The attached image is a visual reference only: keep its characters, rendering style and colour palette, but do not copy its composition, pose or framing. Compose a new image from this brief:";

export function withReferenceNote(prompt: string, reference: unknown): string {
  return reference === undefined ? prompt : `${referenceNote}\n\n${prompt}`;
}

export interface ReferencePicture {
  readonly image: GeneratedImage;
  // Who or what the picture shows; undefined for the establishing image.
  readonly member?: string | undefined;
}

// Every picture a request carries, in the order they are attached: the establishing image,
// then each mentioned cast member's pictures.
export function referencePictures(
  req: Pick<ImageRequest, "reference" | "cast">,
): readonly ReferencePicture[] {
  return [
    ...(req.reference === undefined ? [] : [{ image: req.reference }]),
    ...(req.cast ?? []).flatMap((member) =>
      member.images.map((image) => ({ image, member: member.name })),
    ),
  ];
}

// The prompt a provider sends with the first `limit` of `referencePictures(req)` attached. A
// request without cast keeps exactly the wording it always had. Cast members whose pictures
// did not fit (a provider that takes fewer input images, or none) are described in words.
export function withReferences(
  prompt: string,
  req: Pick<ImageRequest, "reference" | "cast">,
  limit = Number.POSITIVE_INFINITY,
): string {
  if (req.cast === undefined || req.cast.length === 0)
    return limit === 0 ? prompt : withReferenceNote(prompt, req.reference);
  const sent = referencePictures(req).slice(0, limit);
  const lines: string[] = [];
  if (sent.length > 0)
    lines.push(
      "The attached images are visual references only: do not copy their composition, pose or framing.",
    );
  for (const [index, picture] of sent.entries()) {
    const member = req.cast.find((row) => row.name === picture.member);
    lines.push(
      member === undefined
        ? `Image ${String(index + 1)} is the establishing image: keep its characters, rendering style and colour palette.`
        : `Image ${String(index + 1)} shows ${member.name}${describe(member.description)}: draw ${member.name} to look exactly like this.`,
    );
  }
  const shown = new Set(sent.flatMap((picture) => picture.member ?? []));
  for (const member of req.cast)
    if (!shown.has(member.name))
      lines.push(`${member.name} appears in this image${describe(member.description)}.`);
  lines.push("Compose a new image from this brief:");
  return `${lines.join("\n")}\n\n${prompt}`;
}

function describe(description: string): string {
  return description.trim() === "" ? "" : ` (${description.trim()})`;
}

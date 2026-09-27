// What an image API is told about the establishing image sent with a request, ahead of the
// brief. An edit endpoint otherwise treats its input as the picture to change, so it says the
// input is a reference for the look and the cast, not the composition to keep.
export const referenceNote =
  "The attached image is a visual reference only: keep its characters, rendering style and colour palette, but do not copy its composition, pose or framing. Compose a new image from this brief:";

export function withReferenceNote(prompt: string, reference: unknown): string {
  return reference === undefined ? prompt : `${referenceNote}\n\n${prompt}`;
}

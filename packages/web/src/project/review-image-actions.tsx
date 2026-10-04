import { thumbnailVariant } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { ImageUpIcon } from "lucide-react";
import { type ReactElement, use } from "react";
import { Button } from "@/components/kit/button";
import type { Aspect } from "@/components/kit/media";
import { useCompare } from "./review-compare.js";
import { focusPiece } from "./review-focus.js";
import { EditRequestContext } from "./revision-action-context.js";
import { useCurrentRevisionView } from "./revision-media.js";
import { thumbnailPiece } from "./revision-thumbnail-files.js";

// A picture's review actions beside Regenerate: compare it with the version it replaced, and,
// for a slideshow image or a drawn thumbnail, replace it with a file of one's own — Edit
// project → Images opens at its Replace field, to choose the file, save, and remake only what
// uses it.
export function ImageReviewActions({
  output,
  name,
  aspect,
  replaceable,
  disabled,
}: {
  readonly output: Output;
  // "image 4", "thumbnail 2".
  readonly name: string;
  readonly aspect: Aspect;
  readonly replaceable: boolean;
  readonly disabled: boolean;
}): ReactElement {
  const compare = useCompare(output, name, aspect);
  const view = useCurrentRevisionView();
  const requestEdit = use(EditRequestContext);
  const workKey = view?.outputs.find((row) => row.output.id === output.id && row.selected)?.workKey;
  const imageKey = workKey?.startsWith("image:") ? workKey.slice("image:".length) : undefined;
  const variant = workKey === undefined ? undefined : thumbnailVariant(workKey);
  // The Edit project field that takes the file: the image's box, or the thumbnail's own field.
  const piece =
    imageKey !== undefined
      ? `image:${imageKey}`
      : variant !== undefined
        ? thumbnailPiece(variant)
        : undefined;
  return (
    <>
      {compare.button}
      {replaceable && piece !== undefined && requestEdit !== undefined ? (
        <Button
          size="small"
          disabled={disabled}
          disabledReason="Wait until the work on this project is done"
          aria-label={`Replace ${name} with my file`}
          title={`Replace ${name} with my file`}
          onClick={() => {
            requestEdit({ section: "images", change: (edit) => edit });
            focusPiece(piece);
          }}
        >
          <ImageUpIcon aria-hidden="true" strokeWidth={1.75} />
        </Button>
      ) : null}
      {compare.dialog}
    </>
  );
}

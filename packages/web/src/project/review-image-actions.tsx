import { thumbnailVariant } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { ChevronDownIcon } from "lucide-react";
import { type ReactElement, use } from "react";
import { Button } from "@/components/kit/button";
import type { Aspect } from "@/components/kit/media";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/kit/menu";
import { useCompare } from "./review-compare.js";
import { focusPiece } from "./review-focus.js";
import { EditRequestContext } from "./revision-action-context.js";
import { useCurrentRevisionView } from "./revision-media.js";
import { thumbnailPiece } from "./revision-thumbnail-files.js";

// A picture tile's rarer actions behind one worded "More": compare it with the version it
// replaced; for a slideshow image or a drawn thumbnail, replace it with a file of one's own
// (the settings open at its Replace field, to choose the file, save, and remake only what uses
// it); and Delete, last and apart. Nothing when none applies.
export function TileMore({
  output,
  name,
  aspect,
  replaceable,
  disabled,
  onDelete,
}: {
  readonly output: Output;
  // "image 4", "thumbnail 2", "the thumbnail".
  readonly name: string;
  readonly aspect: Aspect;
  readonly replaceable: boolean;
  // While the project works, what would change it waits.
  readonly disabled: boolean;
  readonly onDelete?: (() => void) | undefined;
}): ReactElement | null {
  const compare = useCompare(output, name, aspect);
  const view = useCurrentRevisionView();
  const requestEdit = use(EditRequestContext);
  const workKey = view?.outputs.find((row) => row.output.id === output.id && row.selected)?.workKey;
  const imageKey = workKey?.startsWith("image:") ? workKey.slice("image:".length) : undefined;
  const variant = workKey === undefined ? undefined : thumbnailVariant(workKey);
  // The settings field that takes the file: the image's box, or the thumbnail's own field.
  const piece =
    imageKey !== undefined
      ? `image:${imageKey}`
      : variant !== undefined
        ? thumbnailPiece(variant)
        : undefined;
  const replace =
    replaceable && piece !== undefined && requestEdit !== undefined
      ? () => {
          requestEdit({ section: "images", change: (edit) => edit });
          focusPiece(piece);
        }
      : undefined;
  if (compare.open === undefined && replace === undefined && !onDelete) return null;
  return (
    <>
      <Menu modal={false}>
        <MenuTrigger asChild>
          <Button size="small">
            More<span className="sr-only"> for {name}</span>
            <ChevronDownIcon aria-hidden="true" strokeWidth={1.75} />
          </Button>
        </MenuTrigger>
        <MenuContent align="start">
          {compare.open === undefined ? null : (
            <MenuItem onSelect={compare.open}>Compare with previous</MenuItem>
          )}
          {replace === undefined ? null : (
            <MenuItem disabled={disabled} onSelect={replace}>
              Replace with my file
            </MenuItem>
          )}
          {onDelete === undefined ? null : (
            <>
              <MenuSeparator />
              <MenuItem disabled={disabled} className="text-danger" onSelect={onDelete}>
                Delete {name}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      {compare.dialog}
    </>
  );
}

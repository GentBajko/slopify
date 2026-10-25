import { CopyIcon, HistoryIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/kit/menu";
import { cn } from "@/lib/utils";

// The actions of one list row, in the same order on every list. What a row is for stays on it:
// Edit (a link to the editor) and Make a video (opens Create with it picked). The occasional
// ones (Duplicate, Versions, Delete) sit behind one More button, so a long list doesn't repeat
// five controls on every line. A list leaves out what its rows can't do (a PDF look makes no
// video and keeps no versions).
export function LibraryRowActions({
  name,
  edit,
  duplicate,
  play,
  onVersions,
  onDelete,
  className,
}: {
  readonly name: string;
  // The Edit link: a small quiet `ButtonLink` to the editor.
  readonly edit: ReactNode;
  // The Duplicate link: a plain router `Link` holding `<DuplicateLabel />`, drawn as a menu
  // item like Versions and Delete beside it.
  readonly duplicate: ReactNode;
  // Make a video: `run` is undefined while the screen has no Create to hand to, and `blocked`
  // says why it is unavailable right now (shown as the button's title).
  readonly play?:
    | { readonly run: (() => void) | undefined; readonly blocked?: string | undefined }
    | undefined;
  readonly onVersions?: (() => void) | undefined;
  readonly onDelete: () => void;
  readonly className?: string;
}): ReactElement {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a fieldset of inputs.
    <div
      role="group"
      aria-label={`Actions for ${name}`}
      className={cn("flex flex-wrap items-center gap-0.5", className)}
    >
      {edit}
      {play === undefined ? null : (
        <Button
          variant="quiet"
          size="small"
          aria-label={`Make a video with ${name}`}
          disabledReason={play.blocked}
          disabled={play.run === undefined || play.blocked !== undefined}
          onClick={play.run}
        >
          Make a video
        </Button>
      )}
      <Menu>
        <MenuTrigger asChild>
          <IconButton size="small" label={`More actions for ${name}`}>
            <MoreHorizontalIcon aria-hidden="true" />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          <MenuItem asChild>{duplicate}</MenuItem>
          {onVersions === undefined ? null : (
            <MenuItem aria-label={`Versions of ${name}`} onSelect={onVersions}>
              <HistoryIcon aria-hidden="true" className="size-4" />
              Versions
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem aria-label={`Delete ${name}`} onSelect={onDelete}>
            <Trash2Icon aria-hidden="true" className="size-4" />
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

// What a row's Duplicate link says, with the same icon column as the menu's other items.
export function DuplicateLabel(): ReactElement {
  return (
    <>
      <CopyIcon aria-hidden="true" className="size-4" />
      Duplicate
    </>
  );
}

import { HistoryIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/kit/menu";
import { cn } from "@/lib/utils";

// The actions of one Library row, in the same order on every Library tab. What a row is for
// stays on it: Edit (a link to the editor) and Use in Play. The occasional ones (Duplicate,
// History, Delete) sit behind one More button, so a long list doesn't repeat five controls on
// every line. A tab leaves out what its rows can't do (a document theme has no Play or History).
export function LibraryRowActions({
  name,
  edit,
  duplicate,
  play,
  onHistory,
  onDelete,
  className,
}: {
  readonly name: string;
  // The Edit and Duplicate links: a small quiet `Button asChild` around a router `Link`.
  readonly edit: ReactNode;
  readonly duplicate: ReactNode;
  // Use in Play: `run` is undefined while the screen has no Play to hand to, and `blocked`
  // says why it is unavailable right now (shown as the button's title).
  readonly play?:
    | { readonly run: (() => void) | undefined; readonly blocked?: string | undefined }
    | undefined;
  readonly onHistory?: (() => void) | undefined;
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
          aria-label={`Use ${name} in Play`}
          title={play.blocked}
          disabled={play.run === undefined || play.blocked !== undefined}
          onClick={play.run}
        >
          Use in Play
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
          {onHistory === undefined ? null : (
            <MenuItem aria-label={`History of ${name}`} onSelect={onHistory}>
              <HistoryIcon aria-hidden="true" className="size-4" />
              History
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

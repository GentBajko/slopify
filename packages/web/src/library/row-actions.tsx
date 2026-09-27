import { HistoryIcon, Trash2Icon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { cn } from "@/lib/utils";

// The actions of one Library row, all visible rather than behind a menu, in the same order on
// every Library tab: Edit and Duplicate (links: they open the editor), Use in Play, then
// History and Delete as icon buttons. A tab leaves out what its rows can't do (a document
// theme has no Play or History), and the rest keep their order.
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
      {duplicate}
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
      {onHistory === undefined ? null : (
        <IconButton size="small" label={`History of ${name}`} onClick={onHistory}>
          <HistoryIcon aria-hidden="true" />
        </IconButton>
      )}
      <IconButton size="small" label={`Delete ${name}`} onClick={onDelete}>
        <Trash2Icon aria-hidden="true" />
      </IconButton>
    </div>
  );
}

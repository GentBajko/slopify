import { HistoryIcon, PlayIcon, Trash2Icon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The actions of one Library row, all visible rather than behind a menu: Edit and Duplicate are
// links (they open the editor), Use in Play, History and Delete are buttons. The same order on
// every Library tab.
export function LibraryRowActions({
  name,
  edit,
  duplicate,
  onUseInPlay,
  playBlocked,
  onHistory,
  onDelete,
  className,
}: {
  readonly name: string;
  // The Edit and Duplicate links, as `Button asChild` wrapping a router `Link`.
  readonly edit: ReactNode;
  readonly duplicate: ReactNode;
  readonly onUseInPlay: (() => void) | undefined;
  // Why Use in Play is unavailable right now, shown as the button's title.
  readonly playBlocked?: string | undefined;
  readonly onHistory: () => void;
  readonly onDelete: () => void;
  readonly className?: string;
}): ReactElement {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a fieldset of inputs.
    <div
      role="group"
      aria-label={`Actions for ${name}`}
      className={cn("flex flex-wrap items-center gap-1", className)}
    >
      {edit}
      {duplicate}
      <Button
        type="button"
        variant="ghost"
        aria-label={`Use ${name} in Play`}
        title={playBlocked}
        disabled={onUseInPlay === undefined || playBlocked !== undefined}
        onClick={onUseInPlay}
      >
        <PlayIcon aria-hidden="true" className="size-[14px]" />
        Use in Play
      </Button>
      <Button type="button" variant="ghost" aria-label={`History of ${name}`} onClick={onHistory}>
        <HistoryIcon aria-hidden="true" className="size-[14px]" />
        History
      </Button>
      <Button type="button" variant="ghost" aria-label={`Delete ${name}`} onClick={onDelete}>
        <Trash2Icon aria-hidden="true" className="size-[14px]" />
        Delete
      </Button>
    </div>
  );
}

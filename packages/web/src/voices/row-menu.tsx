import { EllipsisIcon } from "lucide-react";
import type { ReactElement } from "react";
import { IconButton } from "@/components/kit/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";

// A row's rare actions behind one overflow button: Move up, Move down and Duplicate. An action
// left out (the first row cannot move up) shows disabled, so the menu keeps its shape.
export function RowMenu({
  name,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}: {
  // The row as the button's label says it: "More for Alex".
  readonly name: string;
  readonly onMoveUp?: (() => void) | undefined;
  readonly onMoveDown?: (() => void) | undefined;
  readonly onDuplicate?: (() => void) | undefined;
}): ReactElement {
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <IconButton size="small" label={`More for ${name}`}>
          <EllipsisIcon aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem disabled={onMoveUp === undefined} onSelect={() => onMoveUp?.()}>
          Move up
        </MenuItem>
        <MenuItem disabled={onMoveDown === undefined} onSelect={() => onMoveDown?.()}>
          Move down
        </MenuItem>
        <MenuItem disabled={onDuplicate === undefined} onSelect={() => onDuplicate?.()}>
          Duplicate
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

import {
  ArrowDownIcon,
  ArrowDownToLineIcon,
  ArrowUpIcon,
  ArrowUpToLineIcon,
  CopyIcon,
  EllipsisIcon,
  ListPlusIcon,
  XIcon,
} from "lucide-react";
import { type KeyboardEvent, type ReactElement, useRef } from "react";
import { IconButton } from "@/components/kit/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";

const icon = { "aria-hidden": true, strokeWidth: 1.75 } as const;

export type MoveTo = (to: number, where: string) => void;

// Alt+Up / Alt+Down in a topic's field moves the topic. True when the key was a move.
export function altArrowMove(
  event: KeyboardEvent,
  at: { readonly index: number; readonly count: number; readonly busy: boolean },
  onMove: MoveTo,
): boolean {
  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return false;
  event.preventDefault();
  const up = event.key === "ArrowUp";
  if (at.busy || (up && at.index === 0) || (!up && at.index === at.count - 1)) return true;
  onMove(at.index + (up ? -1 : 1), up ? "up" : "down");
  return true;
}

export const moveKeys = "Alt+ArrowUp Alt+ArrowDown";

// A topic row's actions: Up, Down and Remove in sight, and the rarer Move to top, Move to
// bottom, Insert below and Duplicate under More.
export function TopicRowActions({
  name,
  index,
  count,
  busy,
  onMove,
  onRemove,
  onInsertBelow,
  onDuplicate,
}: {
  // How the buttons name the topic: "Move Cleopatra up".
  readonly name: string;
  readonly index: number;
  readonly count: number;
  readonly busy: boolean;
  readonly onMove: MoveTo;
  readonly onRemove: () => void;
  readonly onInsertBelow: () => void;
  readonly onDuplicate: () => void;
}): ReactElement {
  // Insert below opens its field once the menu has closed, so the field keeps the focus the
  // menu would hand back to More.
  const inserting = useRef(false);
  const first = index === 0;
  const last = index === count - 1;
  return (
    <>
      <IconButton
        size="small"
        label={`Move ${name} up`}
        disabled={busy || first}
        onClick={() => onMove(index - 1, "up")}
      >
        <ArrowUpIcon {...icon} />
      </IconButton>
      <IconButton
        size="small"
        label={`Move ${name} down`}
        disabled={busy || last}
        onClick={() => onMove(index + 1, "down")}
      >
        <ArrowDownIcon {...icon} />
      </IconButton>
      <IconButton size="small" label={`Remove ${name}`} disabled={busy} onClick={onRemove}>
        <XIcon {...icon} />
      </IconButton>
      <Menu>
        <MenuTrigger asChild>
          <IconButton size="small" label={`More for ${name}`} disabled={busy}>
            <EllipsisIcon {...icon} />
          </IconButton>
        </MenuTrigger>
        <MenuContent
          onCloseAutoFocus={(event) => {
            if (!inserting.current) return;
            inserting.current = false;
            event.preventDefault();
            onInsertBelow();
          }}
        >
          <MenuItem disabled={first} onSelect={() => onMove(0, "to the top")}>
            <ArrowUpToLineIcon {...icon} className="size-4" />
            Move to top
          </MenuItem>
          <MenuItem disabled={last} onSelect={() => onMove(count - 1, "to the bottom")}>
            <ArrowDownToLineIcon {...icon} className="size-4" />
            Move to bottom
          </MenuItem>
          <MenuItem
            onSelect={() => {
              inserting.current = true;
            }}
          >
            <ListPlusIcon {...icon} className="size-4" />
            Insert below
          </MenuItem>
          <MenuItem onSelect={onDuplicate}>
            <CopyIcon {...icon} className="size-4" />
            Duplicate
          </MenuItem>
        </MenuContent>
      </Menu>
    </>
  );
}

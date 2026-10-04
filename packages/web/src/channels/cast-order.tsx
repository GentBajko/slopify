import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EllipsisIcon } from "lucide-react";
import { type KeyboardEvent, type ReactElement, useRef } from "react";
import { useApp } from "@/app-context";
import { IconButton } from "@/components/kit/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";
import { useToast } from "@/components/kit/toast";
import { type CastMember, type Channel, channelKey, moveCastMember } from "./api";

// The cast's own order: Move up, Move down, Move to top and Move to bottom in a member's menu,
// Alt+Up / Alt+Down on its buttons, and Undo in the message that follows a move.

export const castMoveKeys = "Alt+ArrowUp Alt+ArrowDown";

export interface CastMove {
  readonly busy: boolean;
  // Moves the member to a place in the whole cast (0 is first); `where` says it in the message.
  readonly move: (member: CastMember, to: number, where: string) => void;
  // Alt+Up / Alt+Down on one of the member's controls.
  readonly onKeyDown: (member: CastMember) => (event: KeyboardEvent) => void;
}

type ChannelData = { readonly channel: Channel; readonly cast: readonly CastMember[] };

export function useCastMove(channelId: string, cast: readonly CastMember[]): CastMove {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  // Undo runs after the cast has changed, so every move reads the order as it is now.
  const latest = useRef(cast);
  latest.current = cast;
  const mutation = useMutation({
    mutationFn: (input: { readonly member: CastMember; readonly to: number }) =>
      moveCastMember(api, channelId, input.member.id, input.to),
    onSuccess: async (next) => {
      client.setQueryData<ChannelData>(channelKey(channelId), (old) =>
        old === undefined ? old : { ...old, cast: next },
      );
      await client.invalidateQueries({ queryKey: channelKey(channelId) });
    },
  });
  const move = (member: CastMember, to: number, where: string, undo = true): void => {
    const now = latest.current;
    const from = now.findIndex((one) => one.id === member.id);
    if (from < 0 || to === from || to < 0 || to >= now.length) return;
    mutation.mutate(
      { member, to },
      {
        onSuccess: () =>
          notify(
            `Moved ${member.name} ${where}: ${String(to + 1)} of ${String(now.length)}.`,
            "success",
            undo ? { label: "Undo", run: () => move(member, from, "back", false) } : undefined,
          ),
        onError: (error) =>
          notify(
            `Couldn't move ${member.name}: ${error.message} Try Move up or Move down in its More menu again.`,
            "error",
          ),
      },
    );
  };
  const onKeyDown =
    (member: CastMember) =>
    (event: KeyboardEvent): void => {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      if (mutation.isPending) return;
      const index = latest.current.findIndex((one) => one.id === member.id);
      const up = event.key === "ArrowUp";
      move(member, index + (up ? -1 : 1), up ? "up" : "down");
    };
  return { busy: mutation.isPending, move, onKeyDown };
}

// A member's More menu in the Cast gallery.
export function CastOrderMenu({
  member,
  index,
  count,
  order,
}: {
  readonly member: CastMember;
  // Its place in the whole cast, whatever the search shows.
  readonly index: number;
  readonly count: number;
  readonly order: CastMove;
}): ReactElement {
  const first = index === 0;
  const last = index === count - 1;
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <IconButton
          size="small"
          label={`More for ${member.name}`}
          aria-keyshortcuts={castMoveKeys}
          disabled={count < 2}
          disabledReason="Add another member to change the order"
          onKeyDown={order.onKeyDown(member)}
        >
          <EllipsisIcon aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem
          disabled={first || order.busy}
          onSelect={() => order.move(member, index - 1, "up")}
        >
          Move up
        </MenuItem>
        <MenuItem
          disabled={last || order.busy}
          onSelect={() => order.move(member, index + 1, "down")}
        >
          Move down
        </MenuItem>
        <MenuItem
          disabled={first || order.busy}
          onSelect={() => order.move(member, 0, "to the top")}
        >
          Move to top
        </MenuItem>
        <MenuItem
          disabled={last || order.busy}
          onSelect={() => order.move(member, count - 1, "to the bottom")}
        >
          Move to bottom
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

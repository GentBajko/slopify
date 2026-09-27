import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { Badge } from "@/components/kit/status";
import { cn } from "@/lib/utils";
import {
  type CastMember,
  castKindLabels,
  channelKey,
  channelsKey,
  deleteCastMember,
  pictureUrl,
} from "./api";
import { CastEditor } from "./cast-editor";

// The Cast tab: every character, creature, place and object the channel draws the same way,
// as a gallery of their first pictures, with the picked member's editor beside it (under it
// on phones). The page header's Add to cast opens the editor empty.
export function CastTab({
  channelId,
  cast,
  selected: controlled,
  onSelect: onControlled,
}: {
  readonly channelId: string;
  readonly cast: readonly CastMember[];
  // The member in the editor, "new" while adding one; kept by the caller when it offers its
  // own Add to cast, here otherwise.
  readonly selected?: string | null;
  readonly onSelect?: (id: string | null) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [own, setOwn] = useState<string | null>(null);
  const selected = controlled === undefined ? own : controlled;
  const select = onControlled ?? setOwn;
  const [deleting, setDeleting] = useState<CastMember | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => deleteCastMember(api, id),
    onSuccess: async (_, id) => {
      setDeleting(null);
      if (selected === id) select(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: channelKey(channelId) }),
        client.invalidateQueries({ queryKey: channelsKey }),
      ]);
    },
  });
  const member = cast.find((one) => one.id === selected);
  const editing = selected === "new" || member !== undefined;
  return (
    <div className="grid grid-cols-1 items-start gap-8 min-[1024px]:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0">
        <p className="m-0 mb-4 max-w-[68ch] text-small text-ink-2">
          When a video's title or an image's brief names a member, its pictures go with that image
          as references, so it looks the same in every video.
        </p>
        {cast.length === 0 ? (
          <EmptyState
            title="No cast yet"
            actions={
              <Button variant="secondary" onClick={() => select("new")}>
                Add to cast
              </Button>
            }
          >
            Add the characters, creatures, places and objects this channel keeps coming back to.
          </EmptyState>
        ) : (
          <MediaGrid label="Cast">
            {cast.map((one) => {
              const ready = one.images.filter((image) => image.state === "ready");
              const first = ready[0]?.sha256;
              return (
                <MediaFrame
                  key={one.id}
                  className={cn(
                    one.id === selected &&
                      "rounded-media outline-2 outline-accent outline-offset-4 outline-solid",
                  )}
                  {...(first ? { src: pictureUrl(api, first) } : {})}
                  alt={one.name}
                  title={one.name}
                  meta={`${castKindLabels[one.kind]} · ${String(ready.length)} ${
                    ready.length === 1 ? "picture" : "pictures"
                  }`}
                  {...(ready.length === 0
                    ? { badge: <Badge tone="waiting">No picture</Badge> }
                    : {})}
                  actionsShown
                  actions={
                    <>
                      <Button
                        variant="secondary"
                        size="small"
                        aria-label={`Edit ${one.name}`}
                        aria-pressed={one.id === selected}
                        onClick={() => select(one.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        aria-label={`Delete ${one.name}`}
                        onClick={() => {
                          remove.reset();
                          setDeleting(one);
                        }}
                      >
                        Delete
                      </Button>
                    </>
                  }
                />
              );
            })}
          </MediaGrid>
        )}
        <StatusSlot tone="error" className="mt-2">
          {deleting ? undefined : remove.error?.message}
        </StatusSlot>
      </div>
      <aside aria-label="Cast member editor" className="min-w-0">
        {editing ? (
          <CastEditor
            key={selected ?? "closed"}
            channelId={channelId}
            member={member}
            open
            onClose={() => select(null)}
            onCreated={(id) => select(id)}
          />
        ) : cast.length === 0 ? null : (
          <p className="m-0 text-small text-ink-2">
            Pick a member's Edit to change its names, description and pictures here.
          </p>
        )}
      </aside>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "this cast member"}?`}
        consequence={
          remove.error?.message ??
          "New videos stop using its pictures. Videos already made keep the pictures they were started with."
        }
        confirmLabel="Delete from cast"
        cancelLabel="Keep it"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

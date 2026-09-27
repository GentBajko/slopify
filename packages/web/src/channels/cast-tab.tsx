import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { StatusSlot } from "@/components/kit/action-bar";
import { RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
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
// with its pictures, aliases and the actions to edit or remove it.
export function CastTab({
  channelId,
  cast,
}: {
  readonly channelId: string;
  readonly cast: readonly CastMember[];
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  // "new" while adding; a member's id while editing it.
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CastMember | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => deleteCastMember(api, id),
    onSuccess: async () => {
      setDeleting(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: channelKey(channelId) }),
        client.invalidateQueries({ queryKey: channelsKey }),
      ]);
    },
  });
  const member = cast.find((one) => one.id === editing);
  return (
    <div>
      <div className="mb-3 flex min-h-8 flex-wrap items-center gap-3">
        <p className="flex-1 text-small text-ink2">
          When a video's title or an image's brief names a member, its pictures go with that image
          as references, so it looks the same in every video.
        </p>
        <Button type="button" onClick={() => setEditing("new")}>
          <PlusIcon aria-hidden="true" className="size-[14px]" />
          Add to the cast
        </Button>
      </div>
      {cast.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-6 text-ink2">
            No cast yet. Add the characters, creatures, places and objects this channel keeps coming
            back to.
          </p>
        </RailGroup>
      ) : (
        <ul className="overflow-hidden rounded-panel border border-line bg-panel" aria-label="Cast">
          {cast.map((one) => {
            const ready = one.images.filter((image) => image.state === "ready");
            const first = ready[0]?.sha256;
            return (
              <li
                key={one.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-[10px] last:border-b-0"
              >
                {first ? (
                  <img
                    src={pictureUrl(api, first)}
                    alt=""
                    className="size-12 shrink-0 rounded-control border border-line object-cover"
                  />
                ) : (
                  <span className="size-12 shrink-0 rounded-control border border-dashed border-line2" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-semibold">{one.name}</h3>
                  <p className="text-small text-ink3">
                    {castKindLabels[one.kind]} · {ready.length}{" "}
                    {ready.length === 1 ? "picture" : "pictures"}
                    {one.aliases.length > 0 ? ` · also ${one.aliases.join(", ")}` : ""}
                  </p>
                  {ready.length === 0 ? (
                    <p className="text-small text-amber">
                      No picture yet, so it is not sent with any image.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    aria-label={`Edit ${one.name}`}
                    onClick={() => setEditing(one.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Delete ${one.name}`}
                    onClick={() => {
                      remove.reset();
                      setDeleting(one);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <StatusSlot tone="error" className="mt-2">
        {deleting ? undefined : remove.error?.message}
      </StatusSlot>
      <CastEditor
        key={editing ?? "closed"}
        channelId={channelId}
        member={member}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onCreated={(id) => setEditing(id)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "this cast member"}?`}
        consequence={
          remove.error?.message ??
          "New videos stop using its pictures. Videos already made keep the pictures they were started with."
        }
        verb="Delete"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

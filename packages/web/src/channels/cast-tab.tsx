import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Input } from "@/components/kit/field";
import { Lightbox, type LightboxItem, MediaFrame, MediaGrid } from "@/components/kit/media";
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
import { castDeleteConsequence, castDeleteTitle } from "./delete-copy";

// More members than this and a search box shows above the gallery.
const searchFrom = 8;

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
  // Each member's first ready picture, full size in the lightbox.
  const pictured = cast.flatMap((one) => {
    const first = one.images.find((image) => image.state === "ready")?.sha256;
    return first ? [{ member: one, src: pictureUrl(api, first) }] : [];
  });
  const items: LightboxItem[] = pictured.map((one) => ({
    src: one.src,
    alt: one.member.name,
    caption: `${castKindLabels[one.member.kind]} · ${one.member.description || "No description yet"}`,
  }));
  const [open, setOpen] = useState<number | null>(null);
  // Past a handful of members a search box narrows the gallery by name, other name, kind or
  // description; the member being edited stays shown.
  const [search, setSearch] = useState("");
  const words = search.trim().toLowerCase();
  const shown =
    words === ""
      ? cast
      : cast.filter(
          (one) =>
            one.id === selected ||
            [one.name, ...one.aliases, castKindLabels[one.kind], one.description]
              .join(" ")
              .toLowerCase()
              .includes(words),
        );
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
          <>
            {cast.length > searchFrom ? (
              <Input
                type="search"
                aria-label="Search the cast"
                placeholder={`Search ${String(cast.length)} members by name, kind or description`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="mb-4 max-w-[420px]"
              />
            ) : null}
            {shown.length === 0 ? (
              <p className="m-0 text-small text-ink-2">{`No member's name, kind or description contains "${search.trim()}".`}</p>
            ) : null}
            <MediaGrid label="Cast">
              {shown.map((one) => {
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
                    onOpen={() =>
                      setOpen(pictured.findIndex((entry) => entry.member.id === one.id))
                    }
                    openLabel={`Open ${one.name}'s picture full size`}
                    title={one.name}
                    meta={`${castKindLabels[one.kind]}${one.host === true ? " · Host" : ""} · ${String(ready.length)} ${
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
          </>
        )}
        <Lightbox
          items={items}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          actions={(_, index) => {
            const entry = pictured[index];
            return entry === undefined ? null : (
              <Button
                size="small"
                onClick={() => {
                  setOpen(null);
                  select(entry.member.id);
                }}
              >
                {`Edit ${entry.member.name}`}
              </Button>
            );
          }}
        />
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
        title={castDeleteTitle(deleting?.name)}
        consequence={remove.error?.message ?? castDeleteConsequence}
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

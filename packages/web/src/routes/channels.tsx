import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import {
  type ChannelSummary,
  channelsKey,
  channelsQuery,
  createChannel,
  deleteChannel,
  saveChannel,
} from "@/channels/api";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button, buttonClass } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog, Dialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Field, Input } from "@/components/kit/field";
import { PageHeader } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";

// Channels: one row per channel, each opening its page (brand kit, cast, templates,
// schedules), with Rename and Delete on the row. New channels start empty; the default one
// holds everything made before channels and cannot be deleted.
export function ChannelsRoute(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const channels = useQuery(channelsQuery(api));
  // The name dialog: a new channel, or renaming one.
  const [naming, setNaming] = useState<"new" | ChannelSummary | null>(null);
  const [deleting, setDeleting] = useState<ChannelSummary | null>(null);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => createChannel(api, crypto.randomUUID(), name.trim()),
    onSuccess: async (channel) => {
      await client.invalidateQueries({ queryKey: channelsKey });
      setNaming(null);
      setName("");
      await navigate({ to: "/channels/$channelId", params: { channelId: channel.id } });
    },
  });
  const rename = useMutation({
    mutationFn: (channel: ChannelSummary) =>
      saveChannel(api, channel.id, {
        name: name.trim(),
        brand: channel.brand,
        seriesBrief: channel.seriesBrief,
        baseVersion: channel.version,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: channelsKey });
      setNaming(null);
    },
  });
  const remove = useMutation({
    mutationFn: (channel: ChannelSummary) => deleteChannel(api, channel.id),
    onSuccess: async () => {
      setDeleting(null);
      await client.invalidateQueries({ queryKey: channelsKey });
    },
  });
  const startNew = () => {
    create.reset();
    setName("");
    setNaming("new");
  };
  useCommand({ id: "channels.new", title: "New channel", group: "Channels", run: startNew });
  const saving = naming === "new" ? create : rename;
  const submit = () => {
    if (name.trim() === "" || naming === null) return;
    if (naming === "new") create.mutate();
    else rename.mutate(naming);
  };
  return (
    <div>
      <PageHeader
        title="Channels"
        meta="A channel keeps its brand kit, cast, series brief, templates and schedules together."
        actions={
          <Button variant="primary" aria-expanded={naming === "new"} onClick={startNew}>
            <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            New channel
          </Button>
        }
      />
      <StatusSlot tone={channels.error || remove.error ? "error" : "info"} className="mb-2">
        {channels.error
          ? `The channels couldn't be loaded: ${channels.error.message} Reload the page to try again.`
          : deleting === null && remove.error
            ? remove.error.message
            : channels.isPending
              ? "Loading channels…"
              : undefined}
      </StatusSlot>
      {channels.data?.length === 0 ? (
        <EmptyState
          title="No channels yet"
          actions={
            <Button variant="primary" onClick={startNew}>
              New channel
            </Button>
          }
        >
          Make one for each series you run; it keeps that series' look and cast.
        </EmptyState>
      ) : null}
      {channels.data?.length ? (
        <List label="Channels" className="[&_.sl-row__actions]:flex-wrap">
          {channels.data.map((channel) => (
            <ListRow
              key={channel.id}
              title={
                <Link to="/channels/$channelId" params={{ channelId: channel.id }}>
                  {channel.name}
                </Link>
              }
              meta={`${channel.isDefault ? "Default · " : ""}${String(channel.templates)} ${
                channel.templates === 1 ? "template" : "templates"
              } · ${String(channel.cast)} in the cast`}
              actions={
                <>
                  <Link
                    to="/channels/$channelId"
                    params={{ channelId: channel.id }}
                    aria-label={`Open ${channel.name}`}
                    className={buttonClass({ variant: "quiet", size: "small" })}
                  >
                    Open
                  </Link>
                  <Button
                    variant="quiet"
                    size="small"
                    aria-label={`Rename ${channel.name}`}
                    onClick={() => {
                      rename.reset();
                      setName(channel.name);
                      setNaming(channel);
                    }}
                  >
                    Rename
                  </Button>
                  {channel.isDefault ? null : (
                    <Button
                      variant="quiet"
                      size="small"
                      aria-label={`Delete ${channel.name}`}
                      onClick={() => {
                        remove.reset();
                        setDeleting(channel);
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </List>
      ) : null}
      <Dialog
        open={naming !== null}
        onOpenChange={(open) => {
          if (!open && !saving.isPending) setNaming(null);
        }}
        title={naming === "new" || naming === null ? "New channel" : `Rename ${naming.name}`}
        footer={
          <>
            <StatusSlot tone={saving.error ? "error" : "info"}>
              {saving.error?.message ?? (saving.isPending ? "Saving…" : undefined)}
            </StatusSlot>
            <Button disabled={saving.isPending} onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="channel-name-form"
              variant="primary"
              disabled={saving.isPending || name.trim() === ""}
            >
              {naming === "new" ? "Create channel" : "Rename channel"}
            </Button>
          </>
        }
      >
        <form
          id="channel-name-form"
          aria-label={naming === "new" ? "New channel" : "Rename channel"}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field label="Channel name">
            <Input
              value={name}
              maxLength={200}
              required
              disabled={saving.isPending}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "this channel"}?`}
        consequence={
          remove.error?.message ??
          "Its cast goes with it. Its videos move to the default channel and keep what they were made with."
        }
        confirmLabel="Delete channel"
        cancelLabel="Keep it"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

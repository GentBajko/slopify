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
import { channelDeleteConsequence, channelDeleteTitle } from "@/channels/delete-copy";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog, Dialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Field, Input } from "@/components/kit/field";
import { PageHeader } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { ChannelRoute, type ChannelTab } from "./channel";

// Channels. With one channel there is nothing to pick between, so the page is that channel's
// own page (its tabs at /channels?tab=…), with New channel beside its actions. With several,
// one row per channel, the whole row opening its page, with Rename and Delete on the row. New
// channels start empty; the default one holds everything made before channels and cannot be
// deleted. Without `onTab` (a test rendering the screen alone) the tab lives here.
export function ChannelsRoute({
  tab: tabProp,
  onTab,
}: {
  readonly tab?: ChannelTab | undefined;
  readonly onTab?: ((tab: ChannelTab) => void) | undefined;
} = {}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const channels = useQuery(channelsQuery(api));
  const [ownTab, setOwnTab] = useState<ChannelTab>(tabProp ?? "brand");
  const tab = onTab === undefined ? ownTab : (tabProp ?? "brand");
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
  const newChannel = (
    <Button aria-expanded={naming === "new"} onClick={startNew}>
      <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
      New channel
    </Button>
  );
  const only = channels.data?.length === 1 ? channels.data[0] : undefined;
  return (
    <div data-tour="channels">
      {only === undefined ? (
        <>
          <PageHeader
            title="Channels"
            meta="Each channel has its own look, cast, templates and schedules."
            actions={newChannel}
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
            <List label="Channels" className="sl-list--wrap-actions">
              {channels.data.map((channel) => (
                <ListRow
                  key={channel.id}
                  title={
                    <Link to="/channels/$channelId" params={{ channelId: channel.id }}>
                      {channel.name}
                    </Link>
                  }
                  meta={channelMeta(channel)}
                  actions={
                    <>
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
        </>
      ) : (
        <ChannelRoute
          channelId={only.id}
          tab={tab}
          onTab={(next) => {
            if (onTab === undefined) setOwnTab(next);
            else onTab(next);
          }}
          crumb={false}
          actions={newChannel}
        />
      )}
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
          <Field
            label="Channel name"
            help={
              naming === "new"
                ? "A channel starts empty: give it a look, a cast and templates on its page."
                : undefined
            }
          >
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
        title={channelDeleteTitle(deleting?.name)}
        consequence={remove.error?.message ?? channelDeleteConsequence}
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

// "Default · videos with no channel land here · 2 templates · 1 in the cast".
export function channelMeta(channel: ChannelSummary): string {
  return [
    channel.isDefault ? "Default · videos with no channel land here" : undefined,
    `${String(channel.templates)} ${channel.templates === 1 ? "template" : "templates"}`,
    `${String(channel.cast)} in the cast`,
    briefLine(channel.seriesBrief),
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

// The series brief's first line, short enough for a row.
function briefLine(brief: string): string | undefined {
  const line = brief.trim().split("\n")[0]?.trim() ?? "";
  if (line === "") return undefined;
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

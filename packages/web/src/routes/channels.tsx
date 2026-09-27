import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useId, useState } from "react";
import { useApp } from "@/app-context";
import { channelsKey, channelsQuery, createChannel } from "@/channels/api";
import { StatusSlot } from "@/components/kit/action-bar";
import { Drawer } from "@/components/kit/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LibraryToolbar } from "./library.js";

// Library → Channels: one row per channel, each opening its page (brand kit, cast, templates,
// schedules). New channels start empty; the default one holds everything made before channels.
export function ChannelsRoute(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const channels = useQuery(channelsQuery(api));
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const nameId = useId();
  const create = useMutation({
    mutationFn: () => createChannel(api, crypto.randomUUID(), name.trim()),
    onSuccess: async (channel) => {
      await client.invalidateQueries({ queryKey: channelsKey });
      setCreating(false);
      setName("");
      await navigate({ to: "/channels/$channelId", params: { channelId: channel.id } });
    },
  });
  return (
    <div>
      <LibraryToolbar
        action={
          <Button
            type="button"
            aria-expanded={creating}
            onClick={() => {
              create.reset();
              setCreating(true);
            }}
          >
            <PlusIcon aria-hidden="true" className="size-[14px]" />
            New channel
          </Button>
        }
      >
        <p className="text-small text-ink2">
          A channel keeps its brand kit, cast, series brief, templates and schedules together.
        </p>
      </LibraryToolbar>
      <StatusSlot tone={channels.error ? "error" : "info"} className="mb-2">
        {channels.error?.message ?? (channels.isPending ? "Loading channels…" : undefined)}
      </StatusSlot>
      {channels.data?.length ? (
        <ul
          className="overflow-hidden rounded-panel border border-line bg-panel"
          aria-label="Channels"
        >
          {channels.data.map((channel) => (
            <li
              key={channel.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-[10px] last:border-b-0"
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                <h2 className="break-words font-semibold">
                  <Link
                    to="/channels/$channelId"
                    params={{ channelId: channel.id }}
                    className="hover:underline"
                  >
                    {channel.name}
                  </Link>
                </h2>
                <p className="text-small text-ink3">
                  {channel.isDefault ? "Default · " : ""}
                  {channel.templates} {channel.templates === 1 ? "template" : "templates"} ·{" "}
                  {channel.cast} in the cast
                </p>
              </div>
              <Button
                type="button"
                aria-label={`Open ${channel.name}`}
                onClick={() =>
                  void navigate({ to: "/channels/$channelId", params: { channelId: channel.id } })
                }
              >
                Open
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Drawer
        open={creating}
        title="New channel"
        width="narrow"
        onClose={() => setCreating(false)}
        footer={
          <>
            <StatusSlot tone={create.error ? "error" : "info"}>
              {create.error?.message ?? (create.isPending ? "Creating…" : undefined)}
            </StatusSlot>
            <Button
              type="submit"
              form="new-channel-form"
              variant="primary"
              disabled={create.isPending || name.trim() === ""}
            >
              Create channel
            </Button>
          </>
        }
      >
        <form
          id="new-channel-form"
          aria-label="New channel"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() !== "") create.mutate();
          }}
        >
          <Label htmlFor={nameId} className="mb-2">
            Channel name
          </Label>
          <Input
            id={nameId}
            value={name}
            maxLength={200}
            required
            disabled={create.isPending}
            onChange={(event) => setName(event.target.value)}
          />
        </form>
      </Drawer>
    </div>
  );
}

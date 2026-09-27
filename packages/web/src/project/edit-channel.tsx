import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { channelsQuery, defaultChannelId } from "@/channels/api";
import { Field, Select } from "@/components/kit/field";
import { Switch } from "@/components/kit/switch";

// The project's channel and "Use the channel's brand kit", as Play's Channel row sets them.
// Saving a change takes the channel's cast as it is now and applies its brand kit again
// (`slices/channels/rebrand.ts`); nothing changes while both stay as they were.
export function EditChannel({
  edit,
  saved,
  problem,
  onChange,
}: {
  readonly edit: RevisionEdit;
  // The channel and switch the project was saved with, to say what saving will do.
  readonly saved: RevisionEdit["config"];
  readonly problem: (field: string) => string | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
}): ReactElement {
  const { api } = useApp();
  const channels = useQuery(channelsQuery(api));
  const { config } = edit;
  const known = (id: string | undefined): string =>
    id !== undefined && (channels.data?.some((one) => one.id === id) ?? true)
      ? id
      : defaultChannelId;
  const current = known(config.channelId);
  const channel = channels.data?.find((one) => one.id === current);
  const useKit = config.useBrandKit !== false;
  const moved = current !== known(saved.channelId);
  const switched = useKit !== (saved.useBrandKit !== false);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="Channel"
        error={problem("channelId")}
        help={
          channel === undefined ? undefined : (
            <Link
              to="/channels/$channelId"
              params={{ channelId: channel.id }}
              className="underline"
            >
              Edit {channel.name}
            </Link>
          )
        }
      >
        <Select
          value={current}
          onChange={(event) =>
            onChange({ ...edit, config: { ...config, channelId: event.target.value } })
          }
        >
          {channels.data === undefined ? <option value={current}>Loading channels…</option> : null}
          {(channels.data ?? []).map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
              {one.cast > 0 ? ` · ${String(one.cast)} in the cast` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex min-w-0 flex-col justify-end gap-1">
        <Switch
          checked={useKit}
          label="Use the channel's brand kit"
          onChange={(on) => {
            const { useBrandKit: _kit, ...rest } = config;
            onChange({ ...edit, config: on ? rest : { ...rest, useBrandKit: false } });
          }}
        />
        {useKit ? null : <p className="m-0 text-small text-ink-3">Its cast is still used.</p>}
      </div>
      {channels.error === null ? null : (
        <p className="m-0 text-small text-danger md:col-span-2">
          The channels couldn't be loaded: {channels.error.message}. Reload the page to pick a
          channel.
        </p>
      )}
      {moved || switched ? (
        <p className="m-0 text-small text-ink-2 md:col-span-2">
          {moved
            ? "Saving moves the project to this channel and takes its cast as it is now. "
            : ""}
          {useKit
            ? "The brand kit fills the caption font and colours, title style, end screen, intro, outro and document theme where they are at their default or were set by the old kit."
            : "What the old brand kit had set is taken off."}
        </p>
      ) : null}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useId } from "react";
import { useApp } from "@/app-context";
import { type CastMember, channelQuery, channelsQuery, defaultChannelId } from "@/channels/api";
import { channelOfTemplate } from "@/channels/members-tabs";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import { templatesQuery } from "@/templates/api";
import { usePlaySession } from "./draft-context";

// Which channel the run belongs to: its brand kit fills what this setup leaves at its default
// and its cast goes with the images. A draft that never picked one runs in its template's
// channel, or the default one, which is what the server does too (`draftChannel`).
// The channel the draft runs in, as the server reads it.
export function useDraftChannelId(): string {
  const { api } = useApp();
  const { document } = usePlaySession();
  const templates = useQuery(templatesQuery(api));
  const source = document.templateSource;
  const template = templates.data?.find((one) => one.id === source?.id);
  return (
    document.channelId ?? (template === undefined ? defaultChannelId : channelOfTemplate(template))
  );
}

// The draft channel's cast, for the Speakers panel's "Add from the cast".
export function useDraftCast(): readonly CastMember[] {
  const { api } = useApp();
  const cast = useQuery(channelQuery(api, useDraftChannelId()));
  return cast.data?.cast ?? [];
}

export function ChannelPicker({ disabled = false }: { readonly disabled?: boolean }): ReactElement {
  const { api } = useApp();
  const session = usePlaySession();
  const channels = useQuery(channelsQuery(api));
  const pickerId = useId();
  const kitId = useId();
  const { document } = session;
  const current = useDraftChannelId();
  const channel = channels.data?.find((one) => one.id === current);
  const useKit = document.form.useBrandKit !== false;
  const edit = (next: typeof document) => {
    session.edit(next);
    session.invalidateReview(true);
  };
  return (
    <div className="mt-5 grid grid-cols-1 items-end gap-3 min-[700px]:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 [&>span]:w-full">
        <Label htmlFor={pickerId} className="mb-2">
          Channel
        </Label>
        <Picker
          id={pickerId}
          data-play-field="channelId"
          value={current}
          disabled={disabled}
          onChange={(event) => edit({ ...document, channelId: event.target.value })}
        >
          {channels.data === undefined ? <option value={current}>Loading channels…</option> : null}
          {(channels.data ?? []).map((one) => (
            <option key={one.id} value={one.id}>
              {one.name}
              {one.cast > 0 ? ` · ${String(one.cast)} in the cast` : ""}
            </option>
          ))}
        </Picker>
      </div>
      <label htmlFor={kitId} className="flex min-h-8 items-center gap-2 text-small">
        <input
          id={kitId}
          type="checkbox"
          checked={useKit}
          disabled={disabled}
          onChange={(event) => {
            const { useBrandKit: _kit, ...form } = document.form;
            edit({
              ...document,
              form: event.target.checked ? form : { ...form, useBrandKit: false },
            });
          }}
        />
        Use the channel's brand kit
      </label>
      {channel ? (
        <p className="text-small text-ink3 min-[700px]:col-span-2">
          <Link to="/channels/$channelId" params={{ channelId: channel.id }} className="underline">
            Edit {channel.name}
          </Link>
          {useKit ? "" : " · its cast is still used"}
        </p>
      ) : null}
    </div>
  );
}

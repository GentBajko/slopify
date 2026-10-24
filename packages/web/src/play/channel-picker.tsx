import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useId } from "react";
import { useApp } from "@/app-context";
import { type CastMember, channelQuery, channelsQuery, defaultChannelId } from "@/channels/api";
import { channelOfTemplate } from "@/channels/members-tabs";
import { Switch } from "@/components/kit/switch";
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

// "For My channel ▾", beside Start from, with two or more channels: the channel this video is
// made for. Nothing with one.
export function ChannelFor({
  disabled = false,
}: {
  readonly disabled?: boolean;
}): ReactElement | null {
  const { api } = useApp();
  const session = usePlaySession();
  const channels = useQuery(channelsQuery(api));
  const current = useDraftChannelId();
  const id = useId();
  const { document } = session;
  if ((channels.data?.length ?? 0) < 2) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-small text-ink-2">
        For
      </label>
      <select
        id={id}
        data-play-field="channelId"
        aria-label="For channel"
        className="sl-select sl-select--compact min-w-0 max-w-[240px]"
        value={current}
        disabled={disabled}
        onChange={(event) => {
          session.edit({ ...document, channelId: event.target.value });
          session.invalidateReview(true);
        }}
      >
        {(channels.data ?? []).map((one) => (
          <option key={one.id} value={one.id}>
            {one.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// The Channel row's editor: whether the channel's brand kit fills the defaults, and the way to
// the channel itself.
export function BrandKitControls({
  disabled = false,
}: {
  readonly disabled?: boolean;
}): ReactElement {
  const { api } = useApp();
  const session = usePlaySession();
  const channels = useQuery(channelsQuery(api));
  const { document } = session;
  const current = useDraftChannelId();
  const channel = channels.data?.find((one) => one.id === current);
  const useKit = document.form.useBrandKit !== false;
  return (
    <div className="flex min-w-0 flex-col gap-3 py-2">
      <Switch
        label="Use the channel's brand kit"
        help="Its caption font, intro, outro, PDF look and sounds fill what this setup leaves at its default."
        checked={useKit}
        disabled={disabled}
        onChange={(checked) => {
          const { useBrandKit: _kit, ...form } = document.form;
          session.edit({ ...document, form: checked ? form : { ...form, useBrandKit: false } });
          session.invalidateReview(true);
        }}
      />
      {channel ? (
        <p className="m-0 text-small text-ink-2">
          <Link to="/channels/$channelId" params={{ channelId: channel.id }} className="underline">
            Open {channel.name}
          </Link>
          {useKit ? "" : " · its cast is still used"}
        </p>
      ) : null}
    </div>
  );
}

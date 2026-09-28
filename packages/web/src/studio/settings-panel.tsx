import { type StudioPlaylist, studioPlaylistMax } from "@app/slices/studio/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, PlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { newStudioPairing, readStudioSettings, saveStudioPlaylists } from "@/api";
import { useApp } from "@/app-context";
import { channelsQuery } from "@/channels/api";
import { Button } from "@/components/kit/button";
import { Field, Input, Select } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { ExtensionInstall } from "./extension-install";

export const studioSettingsKey = ["studio", "settings"] as const;

// Settings → YouTube Studio: the playlists each channel's upload packs offer, the pairing token
// the Slopify Studio browser extension needs before it may read a pack, and how to install it.
export function StudioSettings() {
  return (
    <div>
      <SectionHead title="Upload pack and extension" info="settings.studio.extension" />
      <div className="flex flex-col gap-8">
        <Playlists />
        <Pairing />
        <section aria-label="Install the Studio extension">
          <SectionHead as="h3" title="Install the Studio extension" className="mb-3" />
          <ExtensionInstall />
        </section>
      </div>
    </div>
  );
}

// "" is the default, which every channel without its own playlists uses.
const everyChannel = "";

// Each channel's playlists: a list of names, each ticked by default or not. Every upload of a
// project on that channel goes into the ticked ones; Prepare upload can change them for one
// project. A channel with no list of its own uses the default list.
function Playlists() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const errorId = useId();
  const saved = useQuery({ queryKey: studioSettingsKey, queryFn: () => readStudioSettings(api) });
  const channels = useQuery(channelsQuery(api));
  const channelId = useId();
  const [channel, setChannel] = useState(everyChannel);
  const [draft, setDraft] = useState<StudioPlaylist[] | undefined>(undefined);
  const fallback = saved.data?.playlists ?? [];
  const own = channel === everyChannel ? undefined : saved.data?.channelPlaylists[channel];
  const stored = channel === everyChannel ? fallback : (own ?? []);
  const rows = draft ?? stored;
  const problem = playlistsProblem(rows);
  const save = useMutation({
    mutationFn: (list: readonly StudioPlaylist[]) =>
      saveStudioPlaylists(api, list, channel === everyChannel ? undefined : channel),
    onSuccess: () => {
      setDraft(undefined);
      void queryClient.invalidateQueries({ queryKey: studioSettingsKey });
      notify("Playlists saved.", "success");
    },
  });
  const change = (next: StudioPlaylist[]) => {
    save.reset();
    setDraft(next);
  };
  const error = problem ?? save.error?.message;
  const options = [
    { value: everyChannel, label: "Every channel (default)" },
    ...(channels.data ?? []).map((one) => ({ value: one.id, label: one.name })),
  ];
  const names = (list: readonly StudioPlaylist[]) => list.map((one) => one.name).join(", ");
  return (
    <Field
      label="Playlists"
      tip="settings.studio.playlist"
      help={
        channel === everyChannel
          ? "The playlists upload packs offer, for every channel without its own. Ticked ones are on for every project; Prepare upload changes them for one project."
          : own === undefined && fallback.length > 0
            ? `This channel uses the default list (${names(fallback)}) until you add its own.`
            : "This channel's own playlists. Ticked ones are on for every project; Prepare upload changes them for one project."
      }
    >
      <div className="flex flex-col gap-2">
        <Select
          id={channelId}
          aria-label="Channel"
          value={channel}
          options={options}
          onChange={(event) => {
            save.reset();
            setDraft(undefined);
            setChannel(event.currentTarget.value);
          }}
          className="max-w-[260px]"
        />
        {rows.map((row, at) => (
          <div
            // Rows have no id of their own; their place is stable while editing.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={at}
            className="flex flex-wrap items-center gap-2"
          >
            <Input
              autoComplete="off"
              aria-label={`Playlist ${String(at + 1)} name`}
              placeholder="The playlist's name in Studio"
              className="min-w-0 flex-1 basis-[220px]"
              value={row.name}
              disabled={saved.data === undefined}
              aria-invalid={row.name.trim().length > studioPlaylistMax}
              aria-describedby={error === undefined ? undefined : errorId}
              onChange={(event) =>
                change(
                  rows.map((one, i) => (i === at ? { ...one, name: event.target.value } : one)),
                )
              }
            />
            <label className="flex min-h-9 items-center gap-2 text-small">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent)]"
                checked={row.byDefault}
                onChange={(event) => {
                  const on = event.currentTarget.checked;
                  change(rows.map((one, i) => (i === at ? { ...one, byDefault: on } : one)));
                }}
              />
              On by default
            </label>
            <Button
              variant="quiet"
              size="small"
              aria-label={`Remove ${row.name.trim() || `playlist ${String(at + 1)}`}`}
              onClick={() => change(rows.filter((_one, i) => i !== at))}
            >
              Remove
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={saved.data === undefined || rows.length >= 20}
            onClick={() => change([...rows, { name: "", byDefault: rows.length === 0 }])}
          >
            <PlusIcon aria-hidden="true" strokeWidth={1.75} />
            Add playlist
          </Button>
          <Button
            variant="primary"
            disabled={save.isPending || draft === undefined || problem !== undefined}
            onClick={() => save.mutate(rows)}
          >
            Save playlists
          </Button>
        </div>
      </div>
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      )}
    </Field>
  );
}

function playlistsProblem(rows: readonly StudioPlaylist[]): string | undefined {
  const long = rows.find((one) => one.name.trim().length > studioPlaylistMax);
  if (long !== undefined)
    return `A playlist name is longer than YouTube allows (${String(studioPlaylistMax)} characters). Shorten it.`;
  const seen = new Set<string>();
  for (const one of rows) {
    const key = one.name.trim().toLowerCase();
    if (key === "") continue;
    if (seen.has(key)) return `"${one.name.trim()}" is listed twice. Remove one.`;
    seen.add(key);
  }
  return undefined;
}

function Pairing() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const saved = useQuery({ queryKey: studioSettingsKey, queryFn: () => readStudioSettings(api) });
  const reset = useMutation({
    mutationFn: () => newStudioPairing(api),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioSettingsKey });
      notify("New pairing token made. Pair the extension again with it.", "success");
    },
  });
  const pairing = saved.data?.pairing;
  const copy = () => {
    if (pairing === undefined) return;
    if (!navigator.clipboard) {
      notify("Couldn't copy the token. Select it and copy it.", "error");
      return;
    }
    void navigator.clipboard.writeText(pairing.token).then(
      () => notify("Pairing token copied. Paste it into the extension's options.", "success"),
      () => notify("Couldn't copy the token. Select it and copy it.", "error"),
    );
  };
  return (
    <div className="sl-field">
      <div className="flex min-w-0 items-center gap-1">
        <span className="sl-field__label">Extension pairing token</span>
        <InfoTip id="settings.studio.pairing" className="-my-1" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="sl-code min-w-0 flex-1 basis-[220px] truncate py-2 select-all">
          {pairing?.token ?? "…"}
        </code>
        <Button variant="quiet" disabled={pairing === undefined} onClick={copy}>
          <CopyIcon aria-hidden="true" className="size-[14px] shrink-0" />
          Copy
        </Button>
        <Button
          variant="quiet"
          disabled={reset.isPending || pairing === undefined}
          onClick={() => reset.mutate()}
        >
          New pairing token
        </Button>
      </div>
      <p className="sl-field__help m-0">
        {pairing?.origin == null
          ? "No extension is paired. Paste this token into the Slopify Studio extension's options and press Pair."
          : `Paired with the extension at ${pairing.origin}. A new token unpairs it.`}
      </p>
      {reset.error === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {reset.error.message}
        </p>
      )}
    </div>
  );
}

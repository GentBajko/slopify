import { studioPlaylistMax } from "@app/slices/studio/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { useId, useState } from "react";
import { newStudioPairing, readStudioSettings, saveStudioPlaylist } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";

export const studioSettingsKey = ["studio", "settings"] as const;

// Settings → YouTube Studio: the playlist every upload pack names, and the pairing token the
// Slopify Studio browser extension needs before it may read a pack.
export function StudioSettings() {
  return (
    <div>
      <SectionHead title="Upload pack and extension" info="settings.studio.extension" />
      <div className="flex flex-col gap-8">
        <Playlist />
        <Pairing />
      </div>
    </div>
  );
}

function Playlist() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const errorId = useId();
  const saved = useQuery({ queryKey: studioSettingsKey, queryFn: () => readStudioSettings(api) });
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const value = typed ?? saved.data?.playlist ?? "";
  const tooLong =
    value.trim().length > studioPlaylistMax
      ? `The playlist name is longer than YouTube allows (${String(studioPlaylistMax)} characters). Shorten it.`
      : undefined;
  const save = useMutation({
    mutationFn: (playlist: string) => saveStudioPlaylist(api, playlist),
    onSuccess: () => {
      setTyped(undefined);
      void queryClient.invalidateQueries({ queryKey: studioSettingsKey });
      notify("Playlist saved.", "success");
    },
  });
  const error = tooLong ?? save.error?.message;
  return (
    <Field
      label="Playlist"
      tip="settings.studio.playlist"
      help="The playlist every upload pack names."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoComplete="off"
          placeholder="The playlist's name in Studio"
          className="min-w-0 flex-1 basis-[220px]"
          value={value}
          disabled={saved.data === undefined}
          aria-invalid={tooLong !== undefined}
          aria-describedby={error === undefined ? undefined : errorId}
          onChange={(event) => {
            save.reset();
            setTyped(event.target.value);
          }}
        />
        <Button
          variant="primary"
          disabled={save.isPending || typed === undefined || tooLong !== undefined}
          onClick={() => save.mutate(value)}
        >
          Save
        </Button>
      </div>
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      )}
    </Field>
  );
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

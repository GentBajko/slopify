import { studioPlaylistMax } from "@app/slices/studio/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { useId, useState } from "react";
import { newStudioPairing, readStudioSettings, saveStudioPlaylist } from "@/api";
import { useApp } from "@/app-context";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const studioSettingsKey = ["studio", "settings"] as const;

// Settings → YouTube Studio: the playlist every upload pack names, and the pairing token the
// Slopify Studio browser extension needs before it may read a pack.
export function StudioSettings() {
  return (
    <div>
      <SectionHead
        title="YouTube Studio"
        info="Slopify never uploads or publishes. A finished project's Prepare upload lists everything Studio asks for with Copy buttons. The optional Slopify Studio browser extension fills Studio's upload dialog for you; you still press Publish. Install steps: docs/studio-extension.md in the Slopify repository."
      />
      <RailGroup>
        <Playlist />
        <Pairing />
      </RailGroup>
    </div>
  );
}

function Playlist() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const inputId = useId();
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
    <div className="grid items-center gap-[14px] border-b border-line px-4 py-[14px] sm:grid-cols-[240px_1fr]">
      <label htmlFor={inputId} className="font-semibold">
        Playlist
      </label>
      <div className="flex flex-wrap items-center gap-[10px]">
        <Input
          id={inputId}
          autoComplete="off"
          placeholder="The playlist's name in Studio"
          className="min-w-[220px] flex-1"
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
          type="button"
          disabled={save.isPending || typed === undefined || tooLong !== undefined}
          onClick={() => save.mutate(value)}
        >
          Save
        </Button>
        {error === undefined ? null : (
          <p id={errorId} role="alert" className="basis-full text-label text-red">
            {error}
          </p>
        )}
      </div>
    </div>
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
    <div className="grid items-center gap-[14px] px-4 py-[14px] sm:grid-cols-[240px_1fr]">
      <span className="font-semibold">Extension pairing token</span>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-[10px]">
          <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-panel2 px-3 py-[6px] text-small select-all">
            {pairing?.token ?? "…"}
          </code>
          <Button type="button" variant="ghost" disabled={pairing === undefined} onClick={copy}>
            <CopyIcon aria-hidden="true" className="size-[14px] shrink-0" />
            Copy
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={reset.isPending || pairing === undefined}
            onClick={() => reset.mutate()}
          >
            New pairing token
          </Button>
        </div>
        <p className="text-small text-ink2">
          {pairing?.origin == null
            ? "No extension is paired. Paste this token into the Slopify Studio extension's options and press Pair."
            : `Paired with the extension at ${pairing.origin}. A new token unpairs it.`}
        </p>
        {reset.error === null ? null : (
          <p role="alert" className="text-label text-red">
            {reset.error.message}
          </p>
        )}
      </div>
    </div>
  );
}

import type { AudioPreview } from "@app/kernel/audio-preview.js";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { read } from "@/http";

export function LiveAudio({ projectId }: { readonly projectId: string }) {
  const { api } = useApp();
  const preview = useQuery({
    queryKey: ["audio-preview", projectId],
    queryFn: async () =>
      read<{ readonly previews: readonly AudioPreview[] }>(
        await api.client.projects[":projectId"]["audio-preview"].$get({ param: { projectId } }),
      ),
    refetchInterval: 1000,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const items = preview.data?.previews ?? [];
  return (
    <section
      aria-label="Live narration"
      className="grid gap-3 rounded-control border border-line2 bg-panel2 p-3"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-small font-semibold text-ink">Listen while it generates</span>
        <span className="text-small text-ink2">
          Play any part. Each preview starts from its beginning.
        </span>
      </div>
      {preview.error === null ? null : (
        <p className="text-small text-ink2">
          Live preview is temporarily unavailable. Finished audio will still appear here.
        </p>
      )}
      {items.length === 0 && preview.error === null ? (
        <p className="text-small text-ink2">Waiting for the first audio bytes…</p>
      ) : null}
      <div className="grid max-h-[420px] gap-3 overflow-y-auto">
        {items.map((item) => (
          <LivePlayer
            key={item.id}
            preview={item}
            url={`${api.origin}/api/projects/${encodeURIComponent(projectId)}/audio-preview/${item.id}`}
          />
        ))}
      </div>
    </section>
  );
}

function LivePlayer({ preview, url }: { readonly preview: AudioPreview; readonly url: string }) {
  const [failed, setFailed] = useState(false);
  const available =
    (preview.state === "streaming" || preview.state === "ready") && preview.bytes > 0;
  const state =
    preview.state === "ready"
      ? "Ready"
      : preview.state === "streaming"
        ? "Generating"
        : "Preview stopped";
  return (
    <div className="grid gap-2 text-small">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink">{preview.label}</span>
        <span className="text-ink2">{state}</span>
      </div>
      {available && !failed ? (
        <PreviewAudio label={preview.label} url={url} onError={() => setFailed(true)} />
      ) : (
        <p className="text-ink2">
          {preview.state === "streaming" && !failed
            ? "Waiting for audio…"
            : "This preview has stopped. The finished narration will be available when generation completes."}
        </p>
      )}
    </div>
  );
}

function PreviewAudio({
  label,
  url,
  onError,
}: {
  readonly label: string;
  readonly url: string;
  readonly onError: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const player = audio.current;
    return () => {
      if (player === null) return;
      player.pause();
      player.removeAttribute("src");
      player.load();
    };
  }, []);
  return (
    // biome-ignore lint/a11y/useMediaCaption: live generated narration has no timed captions yet.
    <audio
      ref={audio}
      controls
      preload="none"
      aria-label={`Live ${label} narration`}
      src={url}
      onError={onError}
      className="h-9 w-full max-w-[620px]"
    />
  );
}

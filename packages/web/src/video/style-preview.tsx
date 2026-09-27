import type { Format } from "@app/kernel/pipeline.js";
import {
  type StylePreviewImage,
  stylePreviewRequestSchema,
} from "@app/slices/style-preview/schema.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import type { VideoEditSettings } from "@app/slices/video/edit-settings.js";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { pictureUrl } from "@/channels/api";
import { Button } from "@/components/kit/button";
import { Player } from "@/components/kit/player";
import { SectionHead } from "@/components/kit/section-head";
import { fontsKey, listFonts } from "@/subtitles/api";
import { renderStylePreview } from "./style-preview-api";

// "See it before you make it": six seconds rendered by the real renderer with the captions
// and the Look as they are set right now. Renders when shown and again shortly after a
// setting changes; only the latest request's answer is shown.

export interface StylePreviewSettings {
  readonly format: Format;
  readonly subtitles: {
    readonly mode: SubtitleConfig["mode"];
    readonly fontId: string;
    readonly fontSize: number;
    readonly position: SubtitleConfig["position"];
  };
  readonly videoEdit?: VideoEditSettings | undefined;
  readonly previewText?: string | undefined;
  // A picture to draw the preview on instead of the sample stills.
  readonly image?: StylePreviewImage | undefined;
}

// ceiling: long enough that typing a size or stepping through pickers renders once.
const debounceMs = 600;

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "ready"; readonly src: string }
  | { readonly kind: "failed"; readonly message: string };

export function StylePreview({
  settings,
  label = "Style preview",
  drawnOn,
  poster,
}: {
  readonly settings: StylePreviewSettings;
  readonly label?: string;
  // What the picture in settings.image is, in words ("the establishing image").
  readonly drawnOn?: string | undefined;
  // The picture the preview is drawn on, as the player's poster until it plays. A cast
  // picture is found by itself; an output's file is the caller's to give.
  readonly poster?: string | undefined;
}): ReactElement {
  const { api } = useApp();
  const fonts = useQuery({ queryKey: fontsKey, queryFn: () => listFonts(api), staleTime: 60_000 });
  const { format, subtitles, videoEdit, previewText, image } = settings;
  const still = poster ?? (image?.kind === "picture" ? pictureUrl(api, image.sha256) : undefined);
  // The picture as text too: a new but equal object must not render again.
  const picture = image === undefined ? "" : JSON.stringify(image);
  // The request as text, so an equal object from a new render does not render again.
  const request = useMemo(
    () =>
      JSON.stringify({
        format,
        subtitles: {
          mode: subtitles.mode,
          fontId: subtitles.fontId,
          fontSize: subtitles.fontSize,
          position: subtitles.position,
        },
        ...(videoEdit === undefined ? {} : { videoEdit }),
        ...(previewText === undefined || previewText.trim() === "" ? {} : { previewText }),
        ...(picture === "" ? {} : { image: JSON.parse(picture) as unknown }),
      }),
    [
      format,
      subtitles.mode,
      subtitles.fontId,
      subtitles.fontSize,
      subtitles.position,
      videoEdit,
      previewText,
      picture,
    ],
  );
  const valid = useMemo(
    () => stylePreviewRequestSchema.safeParse(JSON.parse(request)).success,
    [request],
  );
  const [state, setState] = useState<State>({ kind: "idle" });
  const [shown, setShown] = useState<string | undefined>(undefined);
  const latest = useRef<AbortController | undefined>(undefined);

  const run = useCallback(
    async (force: boolean): Promise<void> => {
      latest.current?.abort();
      const controller = new AbortController();
      latest.current = controller;
      setState({ kind: "pending" });
      try {
        const reply = await renderStylePreview(
          api,
          { ...stylePreviewRequestSchema.parse(JSON.parse(request)), ...(force ? { force } : {}) },
          controller.signal,
        );
        if (latest.current !== controller) return;
        setShown(reply.src);
        setState({ kind: "ready", src: reply.src });
      } catch (error) {
        if (latest.current !== controller || controller.signal.aborted) return;
        setState({
          kind: "failed",
          message:
            error instanceof Error && error.message !== ""
              ? error.message
              : "The style preview couldn't render. Press Render again.",
        });
      }
    },
    [api, request],
  );

  useEffect(() => {
    if (!valid) return;
    const timer = setTimeout(() => {
      void run(false);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [run, valid]);
  useEffect(() => () => latest.current?.abort(), []);

  const fontName =
    fonts.data?.fonts.find((one) => one.id === subtitles.fontId)?.name ??
    (subtitles.fontId === "default" ? "Barlow" : "Chosen font");
  const summary =
    subtitles.mode === "burn-in"
      ? `Captions: ${fontName} ${String(subtitles.fontSize)} · ${positionLabel(subtitles.position)}`
      : subtitles.mode === "files"
        ? "Captions: a separate file, which players show in their own style"
        : "Captions: off";

  return (
    <section aria-label="Style preview" className="min-w-0 space-y-3">
      <SectionHead
        as="h3"
        title="Style preview"
        meta="6 seconds rendered with your settings"
        info="project.video.style-preview"
      >
        <Button
          variant="quiet"
          size="small"
          disabled={!valid || state.kind === "pending"}
          disabledReason={
            valid ? "Rendering the preview…" : "Fix the caption settings to render the preview."
          }
          onClick={() => {
            void run(true);
          }}
        >
          <RefreshCw aria-hidden="true" size={16} strokeWidth={1.75} />
          Render again
        </Button>
      </SectionHead>
      {shown === undefined ? null : (
        <Player
          src={shown}
          label={label}
          {...(still === undefined ? {} : { poster: still })}
          portrait={format === "9:16"}
          className={format === "9:16" ? "max-w-[270px]" : "max-w-[480px]"}
        />
      )}
      {state.kind === "pending" ? (
        <p role="status" className="text-small text-ink-2">
          Rendering the preview…
        </p>
      ) : null}
      {state.kind === "failed" ? (
        <p role="alert" className="text-small text-danger">
          {state.message}
        </p>
      ) : null}
      {valid ? null : (
        <p className="text-small text-ink-2">
          The preview renders again once the caption size is between 16 and 120.
        </p>
      )}
      <p className="text-small text-ink-2">
        {summary}
        {image === undefined || drawnOn === undefined ? "" : ` · Drawn on ${drawnOn}`}
      </p>
    </section>
  );
}

function positionLabel(position: SubtitleConfig["position"]): string {
  const words = position.replace(/-/g, " ");
  return `${words[0]?.toUpperCase() ?? ""}${words.slice(1)}`;
}

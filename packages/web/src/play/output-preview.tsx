import { type ReactElement, useEffect, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { SubtitlePreview } from "@/subtitles/style-preview";
import { draftAttachmentUrl } from "./draft-api";
import { usePlaySession } from "./draft-context";

export function useWidePlayLayout(): boolean {
  const [wide, setWide] = useState(
    () => window.matchMedia?.("(min-width: 1100px)").matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 1100px)");
    if (!media) return;
    const change = (): void => setWide(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return wide;
}

export function OutputPreview(): ReactElement {
  const { api } = useApp();
  const session = usePlaySession();
  const { form, previewText } = session.document;
  const image =
    form.sources.images === "provide"
      ? form.provided.images
          .map((ref) =>
            session.view?.attachments.find(
              (one) =>
                one.id === ref.attachmentId &&
                one.kind === "images" &&
                one.state === "ready" &&
                one.stagedFileId,
            ),
          )
          .find(Boolean)
      : undefined;
  const backgroundUrl =
    image && session.activeId ? draftAttachmentUrl(api, session.activeId, image.id) : undefined;
  const video = form.sources.video === "generate" && form.sources.images !== "off";
  return (
    <section aria-label="Output preview" className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-small font-semibold">Output preview</h2>
        <Button
          variant="ghost"
          className="text-run-text"
          onClick={() => void session.navigate("style")}
        >
          Edit style ↗
        </Button>
      </div>
      <div className="rounded-control border border-line bg-panel p-4">
        <SubtitlePreview
          value={{ ...form.subtitles, fontSize: Number(form.subtitles.fontSize) }}
          format={form.format}
          sample={previewText}
          showCaptions={form.sources.audio !== "off" && form.subtitles.mode !== "off"}
          maxFrameHeight="max(160px, 100dvh - 360px)"
          {...(backgroundUrl ? { backgroundUrl } : {})}
        />
      </div>
      <p className="mt-3 text-small text-ink3">
        {backgroundUrl
          ? "Style preview using your supplied image."
          : "Style preview only. No generated image is shown."}
      </p>
      <p className="mt-2 text-small text-ink3">
        {!video
          ? "Frame and caption styling apply when Video is enabled."
          : form.subtitles.mode === "burn-in"
            ? "Captions will be burned into the MP4."
            : "Caption styling previews burn-in. SRT/VTT players choose their own styling."}
      </p>
    </section>
  );
}

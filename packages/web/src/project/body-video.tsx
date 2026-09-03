import { assetOf } from "@app/slices/storage/asset-name.js";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { cn } from "@/lib/utils";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { ActionRow, OutputDownload, StageBody } from "./parts.js";
import { duration, percent } from "./summary.js";

// The player at the run's aspect, capped at 720 px tall, with Download .mp4 and Re-render.
// The previous file stays playable through a re-render, and `slices/video/run.ts` swaps it
// only when ffmpeg has exited cleanly, so the player stays on air and a line above it says
// how far the new one has got.
export function VideoBody({ stage, project, outputs, actions, busy }: BodyProps) {
  const { api } = useApp();
  const video = roleOf(outputsOf(outputs, stage), "video");
  const rendering = stage.state === "running";
  const done = percent(stage.progressCurrent ?? 0, stage.progressTotal ?? 0);

  return (
    <StageBody>
      {rendering ? (
        <p className="text-small text-run-text">
          {stage.progressTotal === null ? "Re-rendering" : `Re-rendering · ${String(done)}%`}
        </p>
      ) : null}

      {video === undefined ? (
        <p className="text-small text-ink2">No render has landed yet.</p>
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: the narration is the user's own audio and no caption track exists for it anywhere in the pipeline.
        <video
          controls
          preload="metadata"
          src={fileUrl(api, video.projectId, assetOf(video))}
          className={cn(
            "block max-h-[720px] w-auto max-w-full rounded-control bg-screen",
            project.format === "9:16" ? "aspect-[9/16]" : "aspect-video",
          )}
        />
      )}

      <ActionRow>
        {video === undefined ? null : <OutputDownload output={video} label="Download .mp4" />}
        <ConfirmedButton
          action={{ kind: "rerun", stage: stage.kind }}
          run={() => {
            actions.run({ kind: "rerun", stage: stage.kind });
          }}
          disabled={busy}
          pending={actions.pending}
        >
          Re-render
        </ConfirmedButton>
        <span className="text-small text-ink2">
          {[duration(video?.durationMs ?? undefined), project.format]
            .filter((part) => part !== undefined)
            .join(" · ")}
        </span>
      </ActionRow>
    </StageBody>
  );
}

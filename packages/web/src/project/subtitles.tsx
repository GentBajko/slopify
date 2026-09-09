import type { ProjectSummary } from "@app/slices/admission/model.js";
import type { SubtitleConfig } from "@app/slices/subtitles/model.js";
import { Button } from "@/components/ui/button";
import { sameSubtitles, subtitlesFor, validSubtitleStyle } from "@/subtitles/config";
import { SubtitleControls } from "@/subtitles/controls";
import type { ProjectActions } from "./use-actions";

export function ProjectSubtitles({
  project,
  actions,
  inFlight,
  value,
  uploading,
  onChange,
  onDiscard,
  onUploading,
}: {
  readonly project: ProjectSummary;
  readonly actions: ProjectActions;
  readonly inFlight: boolean;
  readonly value: SubtitleConfig;
  readonly uploading: boolean;
  readonly onChange: (value: SubtitleConfig) => void;
  readonly onDiscard: () => void;
  readonly onUploading: (pending: boolean) => void;
}) {
  const current = subtitlesFor(project.config.subtitles, project.config.sources);
  const dirty = !sameSubtitles(current, value);
  const editable = project.status !== "running" && !inFlight;
  const audioEnabled = project.config.sources.audio !== "off";
  const videoEnabled =
    project.config.sources.video !== "off" && project.config.sources.images !== "off";
  return (
    <div data-tour="project-subtitles" className="mt-2 max-w-[720px] border-t border-line pt-4">
      <SubtitleControls
        value={value}
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        disabled={!editable || actions.pending}
        onChange={onChange}
        onUploading={onUploading}
      />
      <p className="mt-3 text-small text-ink2">
        {!editable
          ? "Pause the run and wait for active requests to stop before changing subtitles."
          : project.status === "paused"
            ? "Save subtitles, then Resume to update the export. Existing narration and images are reused."
            : "Saving updates only the local export using saved narration and images. No paid generation requests are made."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          disabled={
            !editable ||
            actions.pending ||
            uploading ||
            !audioEnabled ||
            !dirty ||
            !validSubtitleStyle(value)
          }
          onClick={() =>
            actions.run(
              { kind: "subtitles", subtitles: subtitlesFor(value, project.config.sources) },
              onDiscard,
            )
          }
        >
          Save subtitles
        </Button>
        {dirty ? (
          <Button variant="ghost" disabled={actions.pending || uploading} onClick={onDiscard}>
            Discard subtitle changes
          </Button>
        ) : null}
        {dirty && project.status === "paused" ? (
          <p className="text-small text-ink2">Save or discard subtitle changes before resuming.</p>
        ) : null}
      </div>
    </div>
  );
}

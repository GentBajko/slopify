import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { useId } from "react";
import { cn } from "@/lib/utils";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { ActionRow, OutputDownload } from "./parts.js";
import { useOutputMedia } from "./revision-media.js";

// The thumbnail at the top of the Images section: the picture itself, large, with Regenerate
// and its download. The prompt behind it is not shown; the picture is what gets judged.
export function ThumbnailPanel({
  stage,
  project,
  outputs,
  actions,
  busy,
}: {
  readonly stage: Stage;
  readonly project: ProjectSummary;
  readonly outputs: readonly Output[];
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
}) {
  const id = useId();
  const image = roleOf(outputsOf(outputs, stage), "thumbnail");
  const media = useOutputMedia(image);
  const tall = project.format === "9:16";
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-[10px]">
      <h3 id={`${id}-title`} className="engraved text-ink3">
        Thumbnail
      </h3>
      {/* The frame is drawn before the picture lands, so nothing below it moves when it does. */}
      <div
        className={cn(
          "w-full overflow-hidden rounded-control border border-line bg-panel2",
          tall ? "aspect-[9/16] max-w-[320px]" : "aspect-video max-w-[720px]",
        )}
      >
        {image === undefined ? (
          <p className="flex h-full items-center justify-center p-4 text-center text-small text-ink2">
            {missing(stage)}
          </p>
        ) : (
          <img
            src={media?.url}
            alt={`Thumbnail for ${project.title}`}
            className="block size-full object-cover animate-tick-in motion-reduce:animate-none"
          />
        )}
      </div>
      <ActionRow>
        <ConfirmedButton
          action={{ kind: "rerun", stage: stage.kind }}
          run={() => {
            actions.run({ kind: "rerun", stage: stage.kind });
          }}
          disabled={busy || stage.state === "pending"}
          pending={actions.pending}
        >
          Regenerate thumbnail
        </ConfirmedButton>
        {image === undefined ? null : <OutputDownload output={image} label="Download thumbnail" />}
      </ActionRow>
    </section>
  );
}

function missing(stage: Stage): string {
  switch (stage.state) {
    case "running":
      return "Making the thumbnail…";
    case "failed":
    case "canceled":
      return "No thumbnail was made. Use Retry thumbnail above to try again.";
    default:
      return "No thumbnail has landed yet.";
  }
}

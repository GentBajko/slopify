import { cn } from "@/lib/utils";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { aspectOf } from "./body-images.js";
import { ConfirmedButton } from "./controls.js";
import { ActionRow, EngravedLabel, Instructions, OutputDownload, StageBody } from "./parts.js";
import { useOutputMedia } from "./revision-media.js";

export function ThumbnailBody({ stage, project, outputs, actions, busy }: BodyProps) {
  const mine = outputsOf(outputs, stage);
  const image = roleOf(mine, "thumbnail");
  const media = useOutputMedia(image);
  const written = project.config.sources.thumbnail === "prompt_by_llm";

  return (
    <StageBody className="grid grid-cols-1 items-start gap-4 min-[900px]:grid-cols-[200px_minmax(0,1fr)]">
      {image === undefined ? (
        <p className="text-small text-ink2">No thumbnail has landed yet.</p>
      ) : (
        <img
          src={media?.url}
          alt={image.meta.prompt ?? "Thumbnail"}
          className={cn(
            "block w-full rounded-control border border-line bg-panel2 object-cover",
            aspectOf(project.format),
          )}
        />
      )}
      <div className="flex flex-col gap-2">
        <EngravedLabel>{written ? "Prompt written by the LLM" : "Prompt"}</EngravedLabel>
        {image?.meta.prompt === undefined ? (
          <p className="text-small text-ink2">This run stored no prompt for the thumbnail.</p>
        ) : (
          <p className="max-w-[75ch] rounded-control border border-line2 bg-panel2 px-[10px] py-2 text-pretty text-small text-ink">
            {image.meta.prompt}
          </p>
        )}
        <ActionRow>
          <ConfirmedButton
            action={{ kind: "rerun", stage: stage.kind }}
            run={() => {
              actions.run({ kind: "rerun", stage: stage.kind });
            }}
            disabled={busy}
            pending={actions.pending}
          >
            Regenerate
          </ConfirmedButton>
          <Instructions output={roleOf(mine, "instructions")} />
          {image === undefined ? null : <OutputDownload output={image} />}
        </ActionRow>
      </div>
    </StageBody>
  );
}

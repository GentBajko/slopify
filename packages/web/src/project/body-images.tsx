import type { Format } from "@app/kernel/pipeline.js";
import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output } from "@app/slices/storage/model.js";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { cn } from "@/lib/utils";
import type { BodyProps } from "./body.js";
import { outputsOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { groupImages } from "./image-groups.js";
import { ActionRow, DownloadLink, EngravedLabel, OutputDownload, StageBody } from "./parts.js";

// Images: a grid per image prompt, 6 columns at 1440 px, prompt name as an engraved header with
// '× N'; per image on hover and focus: Download, Regenerate, Delete; 'Download all' and 'Re-run
// stage' at the group's right.

export function aspectOf(format: Format): string {
  return format === "9:16" ? "aspect-[9/16]" : "aspect-video";
}

export function ImagesBody({ stage, project, outputs, actions, busy }: BodyProps) {
  const groups = groupImages(
    outputsOf(outputs, stage),
    project.config.imagePrompts?.map((prompt) => prompt.name) ?? [],
  );

  return (
    <StageBody>
      <ActionRow>
        <ConfirmedButton
          action={{ kind: "rerun", stage: stage.kind }}
          run={() => {
            actions.run({ kind: "rerun", stage: stage.kind });
          }}
          disabled={busy}
          pending={actions.pending}
        >
          Re-run stage
        </ConfirmedButton>
        <DownloadLink projectId={project.id} asset="images.zip" label="Download all" />
      </ActionRow>

      {groups.length === 0 ? (
        <p className="text-small text-ink2">No images have landed yet.</p>
      ) : null}

      {groups.map((group) => (
        <section key={group.name} className="flex flex-col gap-[10px]">
          <EngravedLabel>{`${group.name} × ${String(group.images.length)}`}</EngravedLabel>
          <div className="grid grid-cols-3 gap-2 min-[900px]:grid-cols-6">
            {group.images.map((image) => (
              <ImageTile
                key={image.id}
                image={image}
                format={project.format}
                actions={actions}
                busy={busy}
              />
            ))}
          </div>
        </section>
      ))}
    </StageBody>
  );
}

function ImageTile({
  image,
  format,
  actions,
  busy,
}: {
  readonly image: Output;
  readonly format: Format;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
}) {
  const { api } = useApp();
  const place = image.meta.index === undefined ? "" : ` ${String(image.meta.index)}`;

  return (
    <figure className="group relative m-0 overflow-hidden rounded-control border border-line bg-panel2">
      <img
        src={fileUrl(api, image.projectId, assetOf(image))}
        alt={image.meta.prompt ?? `Slideshow image${place}`}
        // The image fades in as it lands, which is the grid's whole motion budget.
        className={cn(
          "block w-full object-cover animate-tick-in motion-reduce:animate-none",
          aspectOf(format),
        )}
      />
      {/* Revealed by hover and by focus alike, and always in the tab order, so nothing
          here is hover-only information. */}
      <figcaption className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-1 bg-panel/90 p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
        <OutputDownload output={image} />
        <ConfirmedButton
          action={{ kind: "regenerate-image", outputId: image.id }}
          run={() => {
            actions.run({ kind: "regenerate-image", outputId: image.id });
          }}
          disabled={busy}
          pending={actions.pending}
          variant="ghost"
        >
          Regenerate
        </ConfirmedButton>
        <ConfirmedButton
          action={{ kind: "delete-image", outputId: image.id }}
          run={() => {
            actions.run({ kind: "delete-image", outputId: image.id });
          }}
          disabled={busy}
          pending={actions.pending}
          variant="ghost"
        >
          Delete
        </ConfirmedButton>
      </figcaption>
    </figure>
  );
}

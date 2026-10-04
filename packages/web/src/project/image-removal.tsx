import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { type ReactElement, type ReactNode, useRef } from "react";
import { usePieceFocus } from "./review-focus.js";

// An image deleted from the draft, as it was, so Undo can put it back where it stood with its
// staged replacement and its Regenerate mark.
export interface RemovedImage {
  readonly key: string;
  readonly index: number;
  readonly definition: RevisionEdit["content"]["imageDefinitions"][string];
  readonly uploads: NonNullable<RevisionEdit["uploads"]>;
  readonly regenerate: boolean;
  readonly sources: RevisionEdit["config"]["sources"];
}

const ofImage = (key: string) => (one: NonNullable<RevisionEdit["uploads"]>[number]) =>
  one.destination.kind === "image" && one.destination.imageKey === key;

// The draft without the image, and what Undo needs. The last image turns Images and Video Off.
export function removeImage(
  edit: RevisionEdit,
  key: string,
): { readonly next: RevisionEdit; readonly removed: RemovedImage | undefined } {
  const { content } = edit;
  const definition = content.imageDefinitions[key];
  const index = content.imageOrder.indexOf(key);
  const order = content.imageOrder.filter((one) => one !== key);
  const next: RevisionEdit = {
    ...edit,
    config:
      order.length === 0
        ? { ...edit.config, sources: { ...edit.config.sources, images: "off", video: "off" } }
        : edit.config,
    content: {
      ...content,
      imageOrder: order,
      imageDefinitions: Object.fromEntries(
        Object.entries(content.imageDefinitions).filter(([one]) => one !== key),
      ),
    },
    regenerate: (edit.regenerate ?? []).filter((one) => one !== `image:${key}`),
    uploads: (edit.uploads ?? []).filter((one) => !ofImage(key)(one)),
  };
  return {
    next,
    removed:
      definition === undefined || index === -1
        ? undefined
        : {
            key,
            index,
            definition,
            uploads: (edit.uploads ?? []).filter(ofImage(key)),
            regenerate: edit.regenerate?.includes(`image:${key}`) === true,
            sources: edit.config.sources,
          },
  };
}

// The draft with the deleted image back in its place, or undefined when it is already there.
export function restoreImage(edit: RevisionEdit, gone: RemovedImage): RevisionEdit | undefined {
  if (edit.content.imageOrder.includes(gone.key)) return undefined;
  const order = [...edit.content.imageOrder];
  order.splice(Math.min(gone.index, order.length), 0, gone.key);
  return {
    ...edit,
    // Deleting the last image turned Images and Video Off; bringing it back turns them on again.
    config: { ...edit.config, sources: order.length === 1 ? gone.sources : edit.config.sources },
    content: {
      ...edit.content,
      imageOrder: order,
      imageDefinitions: { ...edit.content.imageDefinitions, [gone.key]: gone.definition },
    },
    uploads: [...(edit.uploads ?? []), ...gone.uploads],
    regenerate: gone.regenerate
      ? [...new Set([...(edit.regenerate ?? []), `image:${gone.key}`])]
      : edit.regenerate,
  };
}

// One image's box. Replace with my file on the project page brings it into view and focus,
// with its replacement upload inside.
export function ImageFieldset({
  imageKey,
  children,
}: {
  readonly imageKey: string;
  readonly children: ReactNode;
}): ReactElement {
  const box = useRef<HTMLFieldSetElement>(null);
  usePieceFocus(`image:${imageKey}`, box);
  return (
    <fieldset
      ref={box}
      tabIndex={-1}
      className="space-y-2 rounded-control border border-line-strong p-3"
    >
      {children}
    </fieldset>
  );
}

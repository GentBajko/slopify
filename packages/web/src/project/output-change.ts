import type { Output } from "@app/slices/storage/model.js";
import { use, useState } from "react";
import {
  EditRequestContext,
  RegenerateNowContext,
  RevisionControlContext,
} from "./revision-action-context.js";
import { useCurrentRevisionView } from "./revision-media.js";
import type { ProjectActions } from "./use-actions.js";

export type OutputChange = "regenerate-image" | "delete-image";

// An output the last saved edit made outdated: it keeps its current version, marked, until
// the next action remakes it.
export function useOutdated(output: Output | undefined): boolean {
  const view = useCurrentRevisionView();
  if (output === undefined) return false;
  return (
    view?.outputs.some((row) => row.output.id === output.id && row.state === "outdated") ?? false
  );
}

// Making one picture again, or deleting it. Regenerate asks first and then makes the picture
// at once; on a project with saved revisions that saves a version with it marked and starts
// only it, and the video keeps the old picture, marked outdated, until it is remade. Delete on
// such a project opens Edit project with the picture gone from the draft, to review and save.
// An older project without revisions asks first and then acts at once for both.
export function useOutputChange(
  output: Output | undefined,
  actions: ProjectActions,
  busy: boolean,
): {
  readonly act: (kind: OutputChange) => void;
  // The confirm dialog's state.
  readonly asking: OutputChange | undefined;
  readonly confirm: () => void;
  readonly dismiss: () => void;
  readonly unavailable: boolean;
  // Delete opens in Edit project rather than asking here.
  readonly viaEdit: boolean;
  // Regenerate saves a new version and leaves the video outdated, rather than re-rendering it.
  readonly now: boolean;
  // Whether the project's revision has loaded, so `act` takes the path it will keep taking.
  readonly ready: boolean;
} {
  const [asking, setAsking] = useState<OutputChange | undefined>();
  const revisioned = use(RevisionControlContext);
  const requestEdit = use(EditRequestContext);
  const regenerateNow = use(RegenerateNowContext);
  const view = useCurrentRevisionView();
  const workKey =
    output === undefined
      ? undefined
      : view?.outputs.find((row) => row.output.id === output.id)?.workKey;
  const viaEdit = revisioned && workKey !== undefined;
  const act = (kind: OutputChange): void => {
    if (output === undefined) return;
    if (!viaEdit || workKey === undefined || kind === "regenerate-image") {
      setAsking(kind);
      return;
    }
    // Only a slideshow image is deleted; a thumbnail or card is only ever made again.
    if (!workKey.startsWith("image:")) return;
    const key = workKey.slice("image:".length);
    requestEdit?.({
      section: "images",
      change: (edit) => ({
        ...edit,
        content: {
          ...edit.content,
          imageOrder: edit.content.imageOrder.filter((one) => one !== key),
          imageDefinitions: Object.fromEntries(
            Object.entries(edit.content.imageDefinitions).filter(([one]) => one !== key),
          ),
        },
        regenerate: (edit.regenerate ?? []).filter((one) => one !== workKey),
      }),
    });
  };
  return {
    act,
    asking,
    confirm: () => {
      const kind = asking;
      setAsking(undefined);
      if (kind === undefined || output === undefined) return;
      if (viaEdit && workKey !== undefined && kind === "regenerate-image")
        regenerateNow?.([workKey]);
      else actions.run({ kind, outputId: output.id });
    },
    dismiss: () => setAsking(undefined),
    unavailable:
      output === undefined ||
      busy ||
      actions.pending ||
      (viaEdit && (requestEdit === undefined || regenerateNow === undefined)),
    viaEdit,
    now: viaEdit,
    ready: !revisioned || view !== undefined,
  };
}

// Making every slideshow image again in one go: asks first, then saves a version with all of
// them marked and starts only them. Undefined for an older project without revisions, or
// before the revision has loaded, where each image's own Regenerate still works.
export function useRegenerateAll(
  images: readonly Output[],
  busy: boolean,
):
  | {
      readonly count: number;
      readonly asking: boolean;
      readonly act: () => void;
      readonly confirm: () => void;
      readonly dismiss: () => void;
      readonly unavailable: boolean;
    }
  | undefined {
  const [asking, setAsking] = useState(false);
  const revisioned = use(RevisionControlContext);
  const regenerateNow = use(RegenerateNowContext);
  const view = useCurrentRevisionView();
  if (!revisioned || view === undefined) return undefined;
  const ids = new Set(images.map((image) => image.id));
  const workKeys = view.outputs.flatMap((row) =>
    ids.has(row.output.id) && row.workKey.startsWith("image:") ? [row.workKey] : [],
  );
  if (workKeys.length === 0) return undefined;
  return {
    count: workKeys.length,
    asking,
    act: () => setAsking(true),
    confirm: () => {
      setAsking(false);
      regenerateNow?.(workKeys);
    },
    dismiss: () => setAsking(false),
    unavailable: busy || regenerateNow === undefined,
  };
}

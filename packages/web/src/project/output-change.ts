import type { Output } from "@app/slices/storage/model.js";
import { use, useState } from "react";
import { EditRequestContext, RevisionControlContext } from "./revision-action-context.js";
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

// Making one picture again, or deleting it. A project with saved revisions changes a picture
// through Edit project: the change opens there, applied to the draft, to review and save, and
// saving marks it outdated so the next action remakes it. An older project without revisions
// asks first and then acts at once.
export function useOutputChange(
  output: Output | undefined,
  actions: ProjectActions,
  busy: boolean,
): {
  readonly act: (kind: OutputChange) => void;
  // The confirm dialog's state for a project without revisions.
  readonly asking: OutputChange | undefined;
  readonly confirm: () => void;
  readonly dismiss: () => void;
  readonly unavailable: boolean;
  // The change opens in Edit project rather than asking here.
  readonly viaEdit: boolean;
} {
  const [asking, setAsking] = useState<OutputChange | undefined>();
  const revisioned = use(RevisionControlContext);
  const requestEdit = use(EditRequestContext);
  const view = useCurrentRevisionView();
  const workKey =
    output === undefined
      ? undefined
      : view?.outputs.find((row) => row.output.id === output.id)?.workKey;
  const viaEdit = revisioned && workKey !== undefined;
  const act = (kind: OutputChange): void => {
    if (output === undefined) return;
    if (!viaEdit || workKey === undefined) {
      setAsking(kind);
      return;
    }
    const key = workKey.startsWith("image:") ? workKey.slice("image:".length) : undefined;
    requestEdit?.({
      section: "images",
      change: (edit) =>
        kind === "regenerate-image" || key === undefined
          ? { ...edit, regenerate: [...new Set([...(edit.regenerate ?? []), workKey])] }
          : {
              ...edit,
              content: {
                ...edit.content,
                imageOrder: edit.content.imageOrder.filter((one) => one !== key),
                imageDefinitions: Object.fromEntries(
                  Object.entries(edit.content.imageDefinitions).filter(([one]) => one !== key),
                ),
              },
              regenerate: (edit.regenerate ?? []).filter((one) => one !== workKey),
            },
    });
  };
  return {
    act,
    asking,
    confirm: () => {
      const kind = asking;
      setAsking(undefined);
      if (kind !== undefined && output !== undefined) actions.run({ kind, outputId: output.id });
    },
    dismiss: () => setAsking(undefined),
    unavailable:
      output === undefined || busy || actions.pending || (viaEdit && requestEdit === undefined),
    viaEdit,
  };
}

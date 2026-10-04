import { thumbnailCountOf } from "@app/slices/admission/model.js";
import { type RevisionEdit, thumbnailOverrideOf } from "@app/slices/revisions/model.js";
import { type ReactElement, useRef, useState } from "react";
import { usePieceFocus } from "./review-focus.js";
import { thumbnailProblem } from "./review-thumbnail.js";
import { RevisionUpload } from "./revision-upload.js";

// Edit project → Images: a drawn thumbnail replaced by a file of one's own, one field per
// thumbnail. Replace with my file beside a thumbnail on the project page opens here at its field.
export function ThumbnailFiles({
  edit,
  getEdit,
  onChange,
  onPending,
}: {
  readonly edit: RevisionEdit;
  readonly getEdit: () => RevisionEdit;
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (key: string, active: boolean) => void;
}): ReactElement | null {
  const source = edit.config.sources.thumbnail;
  if (source !== "from_prompt" && source !== "prompt_by_llm") return null;
  const count = thumbnailCountOf(edit.config);
  return (
    <>
      {Array.from({ length: count }, (_, index) => index + 1).map((variant) => (
        <ThumbnailFile
          key={variant}
          variant={variant}
          count={count}
          edit={edit}
          getEdit={getEdit}
          onChange={onChange}
          onPending={onPending}
        />
      ))}
    </>
  );
}

function ThumbnailFile({
  variant,
  count,
  edit,
  getEdit,
  onChange,
  onPending,
}: {
  readonly variant: number;
  readonly count: number;
  readonly edit: RevisionEdit;
  readonly getEdit: () => RevisionEdit;
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (key: string, active: boolean) => void;
}): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  usePieceFocus(thumbnailPiece(variant), box);
  const [refused, setRefused] = useState<string | undefined>();
  const name = count === 1 ? "the thumbnail" : `thumbnail ${String(variant)}`;
  const label = `Replace ${name} with my file`;
  const slot = thumbnailOverrideOf(variant);
  const own = slot !== undefined && edit.content.thumbnailOverrides?.[slot] !== undefined;
  const chosen = edit.uploads?.some(
    (one) => one.destination.kind === "thumbnail" && one.destination.variant === variant,
  );
  return (
    <div ref={box} tabIndex={-1} className="space-y-1">
      <RevisionUpload
        label={label}
        kind="thumbnail"
        onPending={(active) => onPending(`thumbnail:${String(variant)}`, active)}
        onReady={(file) => {
          // Checked against where it goes: YouTube Studio's thumbnail field.
          const problem = thumbnailProblem(
            file.bytes,
            `Save it smaller (for example as a JPEG), then choose it again under ${label}.`,
          );
          setRefused(problem);
          if (problem !== undefined) return;
          const current = getEdit();
          onChange({
            ...current,
            uploads: [
              ...(current.uploads ?? []).filter(
                (one) =>
                  one.destination.kind !== "thumbnail" || one.destination.variant !== variant,
              ),
              { stagedFileId: file.id, destination: { kind: "thumbnail", variant } },
            ],
          });
        }}
      />
      {refused === undefined ? null : (
        <p role="alert" className="text-small text-danger">
          {refused}
        </p>
      )}
      {chosen === true ? (
        <p className="m-0 text-small text-ink-2">Your file replaces {name} when you save.</p>
      ) : own ? (
        <p className="m-0 text-small text-ink-2">
          Uses your file. Regenerate on the project page draws it again.
        </p>
      ) : null}
    </div>
  );
}

// The Edit project field Replace with my file on the project page asks to show.
export function thumbnailPiece(variant: number): string {
  return `thumbnail:${String(variant)}`;
}

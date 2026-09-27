import type { ReferenceSettings } from "@app/slices/admission/model.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import type { ReactElement } from "react";
import type { Prompt } from "@/api";
import { type ReferenceChoice, ReferenceImage, referenceOff } from "@/play/reference-image";
import { setPrompt } from "./revision-form-state.js";
import { RevisionUpload } from "./revision-upload.js";

// Edit project → Images: the establishing image. Picking a library prompt copies its wording
// into the project's Establishing image prompt (edited under Prompts, keywords and all);
// Upload replaces the file; Off drops it and every image stops being drawn from it.
export function RevisionReference({
  edit,
  prompts,
  problem,
  onChange,
  onPending,
  getEdit,
}: {
  readonly edit: RevisionEdit;
  readonly prompts: readonly Prompt[];
  readonly problem?: ((field: string) => string | undefined) | undefined;
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (pending: boolean) => void;
  // The edit as it is when an upload finishes, which may be newer than this render's.
  readonly getEdit?: (() => RevisionEdit) | undefined;
}): ReactElement | null {
  const { config } = edit;
  if (config.sources.images !== "generate") return null;
  const saved = config.reference;
  const value: ReferenceChoice =
    saved === undefined
      ? referenceOff
      : {
          source: saved.source,
          prompt: saved.prompt ?? "",
          thumbnail: saved.thumbnail !== false,
        };
  const withoutUpload = (next: RevisionEdit): RevisionEdit => ({
    ...next,
    uploads: (next.uploads ?? []).filter(
      (one) => one.destination.kind !== "provided" || one.destination.stage !== "reference",
    ),
  });
  const change = (next: ReferenceChoice): void => {
    const { reference: _old, ...rest } = config;
    if (next.source === "off") {
      onChange(withoutUpload({ ...edit, config: rest }));
      return;
    }
    const reference: ReferenceSettings = {
      source: next.source,
      ...(next.source === "prompt" ? { prompt: next.prompt } : {}),
      // Written only when turned off, so a project that never touched it reads as on.
      ...(next.thumbnail ? {} : { thumbnail: false }),
    };
    const picked =
      next.source === "prompt" && next.prompt !== value.prompt
        ? prompts.find((one) => one.kind === "image" && one.name === next.prompt)
        : undefined;
    const base = { ...edit, config: { ...rest, reference } };
    const updated = picked === undefined ? base : setPrompt(base, "referencePrompt", picked.body);
    onChange(next.source === "provide" ? updated : withoutUpload(updated));
  };
  return (
    <section aria-label="Establishing image" className="space-y-3">
      <ReferenceImage
        value={value}
        prompts={prompts}
        problem={problem}
        onChange={change}
        upload={
          <RevisionUpload
            label={
              edit.content.provided.reference === undefined
                ? "Upload the establishing image"
                : "Replace the establishing image"
            }
            kind="images"
            accept="image/png,image/jpeg"
            onPending={onPending}
            onReady={(file) => {
              const current = withoutUpload(getEdit?.() ?? edit);
              if (current.config.reference?.source !== "provide") return;
              onChange({
                ...current,
                uploads: [
                  ...(current.uploads ?? []),
                  { stagedFileId: file.id, destination: { kind: "provided", stage: "reference" } },
                ],
              });
            }}
          />
        }
      />
    </section>
  );
}

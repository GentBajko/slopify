import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { useId, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { RevisionUpload } from "./revision-upload.js";

const payload = z.object({
  logicalKey: z.string().min(1),
  logicalText: z.string(),
  segment: z.enum(["body", "intro", "outro"]),
  text: z.string(),
});
interface LogicalChunk {
  readonly key: string;
  readonly text: string;
  readonly parts: number;
}
export function narrationGroups(view: RevisionView): {
  readonly groups: readonly LogicalChunk[];
  readonly unmapped: number;
} {
  const groups = new Map<string, LogicalChunk>();
  const ambiguous = new Set<string>();
  let unmapped = 0;
  for (const piece of view.pieces) {
    if (!piece.selected || piece.stageKind !== "audio" || piece.piece.kind !== "chunk") continue;
    let raw: unknown;
    try {
      raw = piece.piece.payload === null ? null : JSON.parse(piece.piece.payload);
    } catch {
      unmapped++;
      continue;
    }
    const parsed = payload.safeParse(raw);
    if (!parsed.success) {
      unmapped++;
      continue;
    }
    const { logicalKey, logicalText } = parsed.data;
    if (ambiguous.has(logicalKey)) {
      unmapped++;
      continue;
    }
    const previous = groups.get(logicalKey);
    if (previous !== undefined && previous.text !== logicalText) {
      unmapped += previous.parts + 1;
      groups.delete(logicalKey);
      ambiguous.add(logicalKey);
      continue;
    }
    groups.set(logicalKey, {
      key: logicalKey,
      text: logicalText,
      parts: (previous?.parts ?? 0) + 1,
    });
  }
  return { groups: [...groups.values()], unmapped };
}
export function NarrationEditor({
  view,
  edit,
  onChange,
  onPending,
  getEdit,
}: {
  readonly getEdit?: () => RevisionEdit;
  readonly view: RevisionView;
  readonly edit: RevisionEdit;
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (key: string, pending: boolean) => void;
}): import("react").ReactElement {
  const editorId = useId();
  const { groups, unmapped } = narrationGroups(view);
  const latest = useRef(edit);
  latest.current = edit;
  const [uploadResets, setUploadResets] = useState<Readonly<Record<string, number>>>({});
  function emit(next: RevisionEdit): void {
    latest.current = next;
    onChange(next);
  }
  return (
    <section aria-label="Edit narration" className="space-y-3">
      <h3>Narration</h3>
      {edit.config.chunking?.mode === "whole" || edit.config.chunking === undefined ? (
        <p>
          This narration uses one whole request. Editing its text rebuilds the whole narration
          request.
        </p>
      ) : null}
      {unmapped === 0 ? null : (
        <p>
          Some older audio cannot be matched reliably to its narration text. Replace the provided
          narration or rebuild from the article to edit those chunks.
        </p>
      )}
      {groups.map((chunk, index) => {
        const override = edit.content.narrationOverrides[chunk.key];
        return (
          <fieldset key={chunk.key} className="space-y-2 rounded-control border border-line2 p-3">
            <legend>Narration chunk {index + 1}</legend>
            <p>
              {chunk.parts} audio {chunk.parts === 1 ? "part" : "parts"} in this narration chunk.
            </p>
            <label htmlFor={`${editorId}-${chunk.key}-text`} className="block text-small">
              Text for narration chunk {index + 1}
              <Textarea
                id={`${editorId}-${chunk.key}-text`}
                value={override?.kind === "text" ? override.text : chunk.text}
                onChange={(event) => {
                  setUploadResets((current) => ({
                    ...current,
                    [chunk.key]: (current[chunk.key] ?? 0) + 1,
                  }));
                  emit({
                    ...edit,
                    ...(edit.uploads === undefined
                      ? {}
                      : {
                          uploads: edit.uploads.filter(
                            (one) =>
                              one.destination.kind !== "narration" ||
                              one.destination.key !== chunk.key,
                          ),
                        }),
                    content: {
                      ...edit.content,
                      narrationOverrides: {
                        ...edit.content.narrationOverrides,
                        [chunk.key]: { kind: "text", text: event.target.value },
                      },
                    },
                  });
                }}
              />
            </label>
            <RevisionUpload
              key={`${chunk.key}:${uploadResets[chunk.key] ?? 0}`}
              label={`Replace narration chunk ${index + 1}`}
              kind="audio"
              onPending={(pending) => onPending(`narration:${chunk.key}`, pending)}
              onReady={(file) => {
                const edit = getEdit?.() ?? latest.current;
                emit({
                  ...edit,
                  regenerate: (edit.regenerate ?? []).filter((one) => one !== chunk.key),
                  uploads: [
                    ...(edit.uploads ?? []).filter(
                      (one) =>
                        one.destination.kind !== "narration" || one.destination.key !== chunk.key,
                    ),
                    { stagedFileId: file.id, destination: { kind: "narration", key: chunk.key } },
                  ],
                });
              }}
            />
            <Button
              type="button"
              onClick={() => {
                const current = getEdit?.() ?? latest.current;
                const narrationOverrides = { ...current.content.narrationOverrides };
                if (narrationOverrides[chunk.key]?.kind === "asset")
                  delete narrationOverrides[chunk.key];
                setUploadResets((resets) => ({
                  ...resets,
                  [chunk.key]: (resets[chunk.key] ?? 0) + 1,
                }));
                emit({
                  ...current,
                  content: { ...current.content, narrationOverrides },
                  uploads: current.uploads?.filter(
                    (one) =>
                      one.destination.kind !== "narration" || one.destination.key !== chunk.key,
                  ),
                  regenerate: [...new Set([...(current.regenerate ?? []), chunk.key])],
                });
              }}
            >
              Regenerate narration chunk {index + 1} after review
            </Button>
          </fieldset>
        );
      })}
    </section>
  );
}

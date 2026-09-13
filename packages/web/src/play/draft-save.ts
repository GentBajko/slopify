import type { DraftView, PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { playDraftDocumentSchema } from "@app/slices/play-drafts/schema.js";
import type { DraftSaveStatus, RevealRequest } from "./draft-context";
import { freshDraftDocument, serializeDraftDocument } from "./draft-state";

export interface SaveClock {
  readonly edited: number;
  readonly acknowledged: number;
  readonly version: number;
}
export interface PendingSave {
  readonly mutationId: string;
  readonly document: PlayDraftDocument;
  readonly generation: number;
  readonly baseVersion: number;
}
export type SaveEvent =
  | { readonly type: "edit" }
  | { readonly type: "acknowledge"; readonly generation: number; readonly version: number };
export function acknowledgeSave(
  current: SaveClock,
  writtenGeneration: number,
  version: number,
): SaveClock {
  return { ...current, acknowledged: Math.max(current.acknowledged, writtenGeneration), version };
}
export function advanceSave(current: SaveClock, event: SaveEvent): SaveClock {
  return event.type === "edit"
    ? { ...current, edited: current.edited + 1 }
    : acknowledgeSave(current, event.generation, event.version);
}
export function freezeSave(
  document: PlayDraftDocument,
  clock: SaveClock,
  mutationId: string,
): PendingSave {
  return {
    mutationId,
    document: playDraftDocumentSchema.parse(JSON.parse(serializeDraftDocument(document))),
    generation: clock.edited,
    baseVersion: clock.version,
  };
}

export interface DraftSessionState {
  readonly document: PlayDraftDocument;
  readonly view: DraftView | null;
  readonly clock: SaveClock;
  readonly id: string | null;
  readonly recoveryId: string | null;
  readonly pending: PendingSave | null;
  readonly status: DraftSaveStatus;
  readonly error: string | null;
  readonly reveal: RevealRequest | null;
}
export function emptySession(): DraftSessionState {
  return {
    document: freshDraftDocument,
    view: null,
    clock: { edited: 0, acknowledged: 0, version: 0 },
    id: null,
    recoveryId: null,
    pending: null,
    status: "unsaved",
    error: null,
    reveal: null,
  };
}

export function remapForkEdits(
  sent: PlayDraftDocument,
  saved: PlayDraftDocument,
  newer: PlayDraftDocument,
): PlayDraftDocument {
  const before = sent.form.provided;
  const after = saved.form.provided;
  const mapping = new Map<string, string>();
  for (const [from, to] of [
    [before.audio, after.audio],
    [before.thumbnail, after.thumbnail],
    ...before.images.map((ref, index) => [ref, after.images[index]]),
  ])
    if (from && to) mapping.set(from.attachmentId, to.attachmentId);
  const remap = (ref: typeof before.audio) =>
    ref ? { ...ref, attachmentId: mapping.get(ref.attachmentId) ?? ref.attachmentId } : null;
  return {
    ...newer,
    form: {
      ...newer.form,
      provided: {
        ...newer.form.provided,
        audio: remap(newer.form.provided.audio),
        thumbnail: remap(newer.form.provided.thumbnail),
        images: newer.form.provided.images.map((ref) => ({
          ...ref,
          attachmentId: mapping.get(ref.attachmentId) ?? ref.attachmentId,
        })),
      },
    },
  };
}

export function retainUploadSettlements(saved: DraftView, current: DraftSessionState): DraftView {
  if (saved.draft.id !== current.id) return saved;
  const provided = current.document.form.provided;
  const owned = new Set(
    [provided.audio, provided.thumbnail, ...provided.images].flatMap((ref) =>
      ref ? [ref.attachmentId] : [],
    ),
  );
  return {
    ...saved,
    attachments: saved.attachments
      .filter((attachment) => owned.has(attachment.id))
      .map((attachment) => {
        const settled = current.view?.attachments.find((one) => one.id === attachment.id);
        return (attachment.state === "pending" || attachment.state === "copying") &&
          (settled?.state === "ready" || settled?.state === "reattach")
          ? settled
          : attachment;
      }),
  };
}

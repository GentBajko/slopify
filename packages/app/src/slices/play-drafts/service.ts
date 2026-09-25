import { statSync } from "node:fs";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { stagingPath } from "../storage/layout.js";
import { stagedFileById } from "../storage/repo.js";
import { releaseStagedFile } from "../storage/staging-refs.js";
import type {
  DraftAttachment,
  DraftDeps,
  DraftResult,
  DraftSaveInput,
  DraftSummary,
  DraftView,
  PlayDraftDocument,
} from "./model.js";
import {
  attachmentRefs,
  attachmentRow,
  attachmentRows,
  type DraftRow,
  draftRow,
  draftRows,
  insertAttachment,
  insertDraft,
  requestHash,
  syncAttachments,
} from "./repo.js";
import {
  createDraftInputSchema,
  discardDraftInputSchema,
  draftViewSchema,
  forkDraftInputSchema,
  playDraftDocumentSchema,
  playReviewSchema,
  playStartResultSchema,
  saveDraftInputSchema,
} from "./schema.js";

type Refusal = Extract<DraftResult<never>, { ok: false }>;
function refusal(reason: Refusal["reason"], row?: DraftRow): Refusal {
  return {
    ok: false,
    reason,
    currentVersion: row?.version ?? null,
    fields: [],
    ...(row?.state === "starting" && row.review_id !== null ? { reviewId: row.review_id } : {}),
  };
}
function writable(row: DraftRow | undefined): Refusal | null {
  if (row === undefined) return refusal("not-found");
  if (row.state === "starting") return refusal("pending-start", row);
  if (row.state === "started") return refusal("already-started", row);
  return null;
}
function validRefs(deps: DraftDeps, id: string, document: PlayDraftDocument): boolean {
  const refs = attachmentRefs(document);
  if (new Set(refs.map((ref) => ref.attachmentId)).size !== refs.length) return false;
  return refs.every((ref) => {
    const old = attachmentRow(deps.db, ref.attachmentId);
    return (
      old === undefined ||
      (old.draft_id === id && old.kind === ref.kind && old.original_filename === ref.name)
    );
  });
}
function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
function documentOf(row: DraftRow): PlayDraftDocument | null {
  if (row.schema_version !== 1) return null;
  const parsed = playDraftDocumentSchema.safeParse(parseStoredJson(row.document_json));
  return parsed.success ? parsed.data : null;
}
function attachmentsOf(deps: DraftDeps, id: string): readonly DraftAttachment[] {
  return attachmentRows(deps.db, id).map((row) => {
    const staged =
      row.staged_file_id === null ? undefined : stagedFileById(deps.db, row.staged_file_id);
    const file =
      staged === undefined
        ? undefined
        : statSync(stagingPath(deps.paths, staged.path), { throwIfNoEntry: false });
    const invalid =
      (row.status === "ready" && row.staged_file_id === null) ||
      (row.staged_file_id !== null &&
        (staged === undefined ||
          (staged.state === "staged" && (!file?.isFile() || file.size !== staged.bytes))));
    const state = invalid ? "reattach" : staged?.state === "copying" ? "copying" : row.status;
    return {
      id: row.id,
      kind: row.kind,
      name: row.original_filename,
      state,
      stagedFileId: invalid ? null : row.staged_file_id,
      bytes: invalid ? 0 : (staged?.bytes ?? 0),
      error: invalid
        ? "This file is missing or did not finish uploading. Attach it again."
        : row.error,
    };
  });
}
export function readDraft(deps: DraftDeps, id: string): DraftResult<DraftView> {
  if (!z.uuid().safeParse(id).success) return refusal("invalid-edit");
  const row = draftRow(deps.db, id);
  if (row === undefined) return refusal("not-found");
  const document = documentOf(row);
  if (document === null) return refusal("invalid-draft", row);
  const receipt =
    row.start_id === null
      ? undefined
      : deps.db.prepare("SELECT result_json FROM play_start_receipts WHERE id=?").get(row.start_id);
  const start =
    receipt === undefined
      ? null
      : playStartResultSchema.parse(
          JSON.parse(z.object({ result_json: z.string() }).parse(receipt).result_json),
        );
  const parsedReview =
    row.review_json === null
      ? null
      : z.object({ review: playReviewSchema }).safeParse(parseStoredJson(row.review_json));
  if (parsedReview !== null && !parsedReview.success) return refusal("invalid-draft", row);
  const review = parsedReview?.data?.review ?? null;
  return {
    ok: true,
    value: draftViewSchema.parse({
      draft: {
        id: row.id,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        document,
      },
      attachments: attachmentsOf(deps, id),
      review,
      pendingStart:
        row.state === "starting" && row.review_id !== null
          ? { reviewId: row.review_id, draftVersion: row.version }
          : null,
      start,
    }),
  };
}
export function listDrafts(deps: DraftDeps): readonly DraftSummary[] {
  return draftRows(deps.db).map((row) => ({
    id: row.id,
    title: row.title,
    version: row.version,
    updatedAt: row.updated_at,
    readable: documentOf(row) !== null,
  }));
}
export function createDraft(
  deps: DraftDeps,
  input: { readonly id: string; readonly document: PlayDraftDocument },
): DraftResult<DraftView> {
  const parsed = createDraftInputSchema.safeParse(input);
  if (!parsed.success) return refusal("invalid-edit");
  return transact(deps.db, () => {
    const value = parsed.data;
    const hash = requestHash(value);
    const old = draftRow(deps.db, value.id);
    if (old !== undefined)
      return old.creation_hash === hash && old.version === 1 && old.state === "active"
        ? readDraft(deps, value.id)
        : refusal("conflict", old);
    if (!validRefs(deps, value.id, value.document)) return refusal("invalid-edit");
    insertDraft(deps.db, value.id, value.document, hash, deps.clock.now().toISOString());
    syncAttachments(deps.db, value.id, value.document);
    return readDraft(deps, value.id);
  });
}
export function saveDraft(deps: DraftDeps, input: DraftSaveInput): DraftResult<DraftView> {
  const parsed = saveDraftInputSchema.safeParse(input);
  if (!parsed.success) return refusal("invalid-edit");
  const previous = attachmentRows(deps.db, input.id);
  const result: DraftResult<DraftView> = transact(deps.db, () => {
    const value = parsed.data;
    const row = draftRow(deps.db, value.id);
    const denied = writable(row);
    if (denied !== null || row === undefined) return denied ?? refusal("not-found");
    const hash = requestHash(value);
    if (row.save_mutation_id === value.mutationId)
      return row.save_request_hash === hash ? readDraft(deps, value.id) : refusal("conflict", row);
    if (row.version !== value.baseVersion) return refusal("conflict", row);
    if (!validRefs(deps, value.id, value.document)) return refusal("invalid-edit", row);
    const changed = deps.db
      .prepare(
        "UPDATE play_drafts SET version=version+1,document_json=?,title=?,updated_at=?,save_mutation_id=?,save_request_hash=?,review_id=NULL,review_json=NULL,review_fingerprint=NULL WHERE id=? AND version=? AND state='active'",
      )
      .run(
        JSON.stringify(value.document),
        value.document.form.title,
        deps.clock.now().toISOString(),
        value.mutationId,
        hash,
        value.id,
        value.baseVersion,
      );
    if (Number(changed.changes) !== 1) return refusal("conflict", draftRow(deps.db, value.id));
    syncAttachments(deps.db, value.id, value.document);
    return readDraft(deps, value.id);
  });
  if (result.ok)
    for (const attachment of previous)
      if (attachment.staged_file_id !== null)
        releaseStagedFile({ ...deps, emit: () => undefined }, attachment.staged_file_id);
  return result;
}
export function forkDraft(
  deps: DraftDeps,
  input: { readonly sourceId: string; readonly id: string; readonly document: PlayDraftDocument },
): DraftResult<DraftView> {
  const parsed = forkDraftInputSchema.safeParse(input);
  if (!parsed.success) return refusal("invalid-edit");
  return transact(deps.db, () => {
    const value = parsed.data;
    const hash = requestHash(value);
    const old = draftRow(deps.db, value.id);
    if (old !== undefined)
      return old.creation_hash === hash && old.version === 1 && old.state === "active"
        ? readDraft(deps, value.id)
        : refusal("conflict", old);
    const source = draftRow(deps.db, value.sourceId);
    const denied = writable(source);
    if (denied !== null) return denied;
    if (!validRefs(deps, value.sourceId, value.document)) return refusal("invalid-edit", source);
    const states = new Map(attachmentsOf(deps, value.sourceId).map((file) => [file.id, file]));
    const replacements = new Map(
      attachmentRefs(value.document).map((ref) => [ref.attachmentId, z.uuid().parse(deps.uuid())]),
    );
    const rewrite = (ref: { readonly attachmentId: string; readonly name: string }) => ({
      attachmentId: z.uuid().parse(replacements.get(ref.attachmentId)),
      name: ref.name,
    });
    const p = value.document.form.provided;
    const document = {
      ...value.document,
      form: {
        ...value.document.form,
        provided: {
          ...p,
          audio: p.audio === null ? null : rewrite(p.audio),
          thumbnail: p.thumbnail === null ? null : rewrite(p.thumbnail),
          images: p.images.map(rewrite),
        },
      },
    };
    insertDraft(deps.db, value.id, document, hash, deps.clock.now().toISOString());
    for (const ref of attachmentRefs(value.document)) {
      const original = states.get(ref.attachmentId);
      const ready = original?.state === "ready" && original.stagedFileId !== null;
      insertAttachment(
        deps.db,
        value.id,
        { ...ref, ...rewrite(ref) },
        ready ? "ready" : "reattach",
        ready ? original.stagedFileId : null,
      );
    }
    return readDraft(deps, value.id);
  });
}
export function discardDraft(
  deps: DraftDeps,
  input: { readonly id: string; readonly baseVersion: number },
): DraftResult<{ readonly discarded: true }> {
  const parsed = discardDraftInputSchema.safeParse(input);
  if (!parsed.success) return refusal("invalid-edit");
  const previous = attachmentRows(deps.db, input.id);
  const result: DraftResult<{ readonly discarded: true }> = transact(deps.db, () => {
    const row = draftRow(deps.db, input.id);
    if (row === undefined) return refusal("not-found");
    if (row.state === "starting") return refusal("pending-start", row);
    if (row.version !== input.baseVersion) return refusal("conflict", row);
    deps.db.prepare("DELETE FROM play_drafts WHERE id=?").run(input.id);
    return { ok: true, value: { discarded: true } };
  });
  if (result.ok)
    for (const attachment of previous)
      if (attachment.staged_file_id !== null)
        releaseStagedFile({ ...deps, emit: () => undefined }, attachment.staged_file_id);
  return result;
}

import { z } from "zod";
import { stageUpload } from "../storage/staging.js";
import { releaseStagedFile } from "../storage/staging-refs.js";
import type { DraftAttachment, DraftDeps, DraftResult } from "./model.js";
import { attachmentRow, draftRow } from "./repo.js";
import { draftAttachmentSchema } from "./schema.js";

export async function uploadDraftAttachment(
  deps: DraftDeps,
  input: {
    readonly draftId: string;
    readonly attachmentId: string;
    readonly content: AsyncIterable<Uint8Array>;
  },
): Promise<DraftResult<DraftAttachment>> {
  const row = z.uuid().safeParse(input.draftId).success
    ? draftRow(deps.db, input.draftId)
    : undefined;
  const refuse = (
    reason: Extract<DraftResult<never>, { ok: false }>["reason"],
  ): DraftResult<DraftAttachment> => ({
    ok: false,
    reason,
    currentVersion: row?.version ?? null,
    fields: [],
    ...(row?.state === "starting" && row.review_id !== null ? { reviewId: row.review_id } : {}),
  });
  if (!z.uuid().safeParse(input.draftId).success || !z.uuid().safeParse(input.attachmentId).success)
    return refuse("invalid-edit");
  if (row === undefined) return refuse("not-found");
  if (row.state === "starting") return refuse("pending-start");
  if (row.state === "started") return refuse("already-started");
  const attachment = attachmentRow(deps.db, input.attachmentId);
  if (attachment === undefined || attachment.draft_id !== input.draftId) return refuse("not-found");
  if (attachment.staged_file_id !== null || attachment.status !== "pending")
    return refuse("conflict");
  const storage = { ...deps, emit: () => undefined };
  const result = await stageUpload(storage, {
    stageKind: attachment.kind,
    originalFilename: attachment.original_filename,
    content: input.content,
    onAllocated(file) {
      const bound = deps.db
        .prepare(
          "UPDATE play_draft_attachments SET staged_file_id=?,error=NULL WHERE id=? AND draft_id=? AND staged_file_id IS NULL AND status='pending' AND EXISTS (SELECT 1 FROM play_drafts WHERE id=? AND state='active')",
        )
        .run(file.id, input.attachmentId, input.draftId, input.draftId);
      if (Number(bound.changes) !== 1)
        throw new Error("Upload attachment changed before allocation.");
    },
  });
  if (!result.ok) {
    deps.db
      .prepare(
        "UPDATE play_draft_attachments SET status='reattach',error=? WHERE id=? AND draft_id=? AND staged_file_id IS NULL",
      )
      .run("Upload failed. Reattach the file.", input.attachmentId, input.draftId);
    return refuse("invalid-edit");
  }
  const updated = deps.db
    .prepare(
      "UPDATE play_draft_attachments SET status='ready',error=NULL WHERE id=? AND draft_id=? AND staged_file_id=?",
    )
    .run(input.attachmentId, input.draftId, result.file.id);
  releaseStagedFile(storage, result.file.id);
  if (Number(updated.changes) !== 1) return refuse("not-found");
  return {
    ok: true,
    value: draftAttachmentSchema.parse({
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.original_filename,
      state: "ready",
      stagedFileId: result.file.id,
      bytes: result.file.bytes,
      error: null,
    }),
  };
}

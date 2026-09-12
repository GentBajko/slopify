import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { fingerprint } from "../../kernel/runner/work.js";
import type { PlayDraftDocument } from "./model.js";

const rowSchema = z.object({
  id: z.string(),
  schema_version: z.number(),
  version: z.number(),
  title: z.string(),
  document_json: z.string(),
  creation_hash: z.string(),
  save_mutation_id: z.string().nullable(),
  save_request_hash: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  state: z.enum(["active", "starting", "started"]),
  review_id: z.string().nullable(),
  review_json: z.string().nullable(),
  review_fingerprint: z.string().nullable(),
  start_id: z.string().nullable(),
});
export type DraftRow = z.infer<typeof rowSchema>;
const attachmentSchema = z.object({
  id: z.string(),
  draft_id: z.string(),
  staged_file_id: z.string().nullable(),
  kind: z.enum(["audio", "images", "thumbnail"]),
  original_filename: z.string(),
  status: z.enum(["pending", "ready", "reattach"]),
  error: z.string().nullable(),
});
export type AttachmentRow = z.infer<typeof attachmentSchema>;
export interface AttachmentRef {
  readonly attachmentId: string;
  readonly name: string;
  readonly kind: "audio" | "images" | "thumbnail";
}
export function draftRow(db: DatabaseSync, id: string): DraftRow | undefined {
  const row = db.prepare("SELECT * FROM play_drafts WHERE id=?").get(id);
  return row === undefined ? undefined : rowSchema.parse(row);
}
export function draftRows(db: DatabaseSync): readonly DraftRow[] {
  return db
    .prepare("SELECT * FROM play_drafts WHERE state='active' ORDER BY updated_at DESC,id")
    .all()
    .map((row) => rowSchema.parse(row));
}
export function attachmentRow(db: DatabaseSync, id: string): AttachmentRow | undefined {
  const row = db.prepare("SELECT * FROM play_draft_attachments WHERE id=?").get(id);
  return row === undefined ? undefined : attachmentSchema.parse(row);
}
export function attachmentRows(db: DatabaseSync, id: string): readonly AttachmentRow[] {
  return db
    .prepare("SELECT * FROM play_draft_attachments WHERE draft_id=? ORDER BY rowid")
    .all(id)
    .map((row) => attachmentSchema.parse(row));
}
export function attachmentRefs(document: PlayDraftDocument): readonly AttachmentRef[] {
  const p = document.form.provided;
  return [
    ...(p.audio === null ? [] : [{ ...p.audio, kind: "audio" as const }]),
    ...p.images.map((file) => ({ ...file, kind: "images" as const })),
    ...(p.thumbnail === null ? [] : [{ ...p.thumbnail, kind: "thumbnail" as const }]),
  ];
}
export function requestHash(value: unknown): string {
  return fingerprint(z.json().parse(JSON.parse(JSON.stringify(value))));
}
export function insertDraft(
  db: DatabaseSync,
  id: string,
  document: PlayDraftDocument,
  hash: string,
  at: string,
): void {
  db.prepare(
    "INSERT INTO play_drafts (id,schema_version,version,title,document_json,creation_hash,created_at,updated_at,state) VALUES (?,1,1,?,?,?,?,?,'active')",
  ).run(id, document.form.title, JSON.stringify(document), hash, at, at);
}
export function insertAttachment(
  db: DatabaseSync,
  id: string,
  ref: AttachmentRef,
  status: "pending" | "ready" | "reattach",
  stagedId: string | null = null,
): void {
  db.prepare(
    "INSERT INTO play_draft_attachments (id,draft_id,kind,original_filename,status,staged_file_id) VALUES (?,?,?,?,?,?)",
  ).run(ref.attachmentId, id, ref.kind, ref.name, status, stagedId);
}
export function syncAttachments(db: DatabaseSync, id: string, document: PlayDraftDocument): void {
  const refs = attachmentRefs(document);
  const retained = new Set(refs.map((ref) => ref.attachmentId));
  for (const old of attachmentRows(db, id))
    if (!retained.has(old.id))
      db.prepare("DELETE FROM play_draft_attachments WHERE id=?").run(old.id);
  // Removed staged bytes remain until reference-aware storage cleanup runs.
  for (const ref of refs)
    if (attachmentRow(db, ref.attachmentId) === undefined) insertAttachment(db, id, ref, "pending");
}

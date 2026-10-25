import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { defaultChannelId } from "../channels/model.js";
import type { DesignResult } from "./model.js";
import { type DesignDocument, designDocumentSchema } from "./schema.js";
import { type DesignDeps, mutationHash, reusedMessage } from "./service.js";
import { documentChecks, type TemplateCheck } from "./template-checks.js";

// Design templates: a designed piece saved with fields to make again by hand or from a
// schedule. Every Save is a new version; a version is marked ready only when its checks pass,
// and only a ready version is what a schedule makes (`runnableDesignVersion`).

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const name = z.string().trim().min(1).max(200);

export const createTemplateSchema = z
  .object({
    id,
    mutationId: z.string().min(8).max(128),
    name,
    document: designDocumentSchema,
    channelId: id.optional(),
  })
  .strict();
export const saveTemplateSchema = z
  .object({
    baseVersion: z.number().int().min(1),
    name,
    document: designDocumentSchema,
    // Whether this Save redraws the editor's sample (`sample.ts`); "skip" saves only.
    sample: z.enum(["make", "skip"]).optional(),
    acknowledgedHigh: z.number().min(0).max(1000).optional(),
  })
  .strict();
export const markReadySchema = z.object({ version: z.number().int().min(1) }).strict();

export interface TemplateVersion {
  readonly version: number;
  readonly name: string;
  readonly gate: "unchecked" | "ready";
  readonly markedAt: string | null;
  readonly createdAt: string;
}

export interface DesignTemplate {
  readonly id: string;
  readonly channelId: string;
  readonly headVersion: number;
  readonly name: string;
  readonly document: DesignDocument;
  readonly gate: "unchecked" | "ready";
  readonly checks: readonly TemplateCheck[];
  // The newest version marked ready, which schedules make; null when none is.
  readonly readyVersion: number | null;
  readonly versions: readonly TemplateVersion[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

const revisionRow = z.object({
  version: z.number(),
  name: z.string(),
  document_json: z.string(),
  gate: z.enum(["unchecked", "ready"]),
  checks_json: z.string().nullable(),
  marked_at: z.string().nullable(),
  created_at: z.string(),
});
const checksSchema = z
  .array(
    z.object({
      id: z.string(),
      ok: z.boolean(),
      sentence: z.string(),
      fix: z.object({ label: z.string(), href: z.string() }).nullable(),
    }),
  )
  .catch([]);

export function templateRevision(
  db: DatabaseSync,
  templateId: string,
  version: number,
):
  | (Omit<TemplateVersion, "version"> & {
      readonly version: number;
      readonly document: DesignDocument;
    })
  | undefined {
  const raw = db
    .prepare("SELECT * FROM design_template_revisions WHERE template_id=? AND version=?")
    .get(templateId, version);
  if (raw === undefined) return undefined;
  const row = revisionRow.parse(raw);
  return {
    version: row.version,
    name: row.name,
    gate: row.gate,
    markedAt: row.marked_at,
    createdAt: row.created_at,
    document: designDocumentSchema.parse(JSON.parse(row.document_json)),
  };
}

export function getTemplate(db: DatabaseSync, templateId: string): DesignTemplate | undefined {
  const head = db
    .prepare(
      "SELECT id, channel_id, head_version, created_at FROM design_templates WHERE id=? AND deleted_at IS NULL",
    )
    .get(templateId);
  if (head === undefined) return undefined;
  const revisions = db
    .prepare("SELECT * FROM design_template_revisions WHERE template_id=? ORDER BY version")
    .all(templateId)
    .map((raw) => revisionRow.parse(raw));
  const current = revisions.find((row) => row.version === head.head_version);
  if (current === undefined) return undefined;
  const ready = revisions.filter((row) => row.gate === "ready").at(-1);
  return {
    id: String(head.id),
    channelId: head.channel_id === null ? defaultChannelId : String(head.channel_id),
    headVersion: current.version,
    name: current.name,
    document: designDocumentSchema.parse(JSON.parse(current.document_json)),
    gate: current.gate,
    checks: current.checks_json === null ? [] : checksSchema.parse(JSON.parse(current.checks_json)),
    readyVersion: ready?.version ?? null,
    versions: revisions.map((row) => ({
      version: row.version,
      name: row.name,
      gate: row.gate,
      markedAt: row.marked_at,
      createdAt: row.created_at,
    })),
    createdAt: String(head.created_at),
    updatedAt: current.created_at,
  };
}

export function listTemplates(db: DatabaseSync): readonly DesignTemplate[] {
  return db
    .prepare(
      "SELECT id FROM design_templates WHERE deleted_at IS NULL ORDER BY created_at DESC, id",
    )
    .all()
    .flatMap((row) => getTemplate(db, String(row.id)) ?? []);
}

const notFound = {
  ok: false,
  reason: "not-found",
  message:
    "This design template no longer exists. Open Templates → Poster templates to choose another.",
} as const;

function invalid(error: z.ZodError): DesignResult<never> {
  return {
    ok: false,
    reason: "invalid",
    message: `The template can't be saved: ${error.issues[0]?.message ?? "a field is missing"}.`,
  };
}

export function createTemplate(deps: DesignDeps, raw: unknown): DesignResult<DesignTemplate> {
  const parsed = createTemplateSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { mutationId, ...input } = parsed.data;
  const hash = mutationHash(input);
  const replay = deps.db
    .prepare("SELECT id, mutation_hash FROM design_templates WHERE mutation_id=?")
    .get(mutationId);
  if (replay !== undefined) {
    if (replay.mutation_hash !== hash)
      return { ok: false, reason: "mutation-reused", message: reusedMessage };
    const template = getTemplate(deps.db, String(replay.id));
    return template === undefined ? notFound : { ok: true, value: template };
  }
  if (deps.db.prepare("SELECT 1 FROM design_templates WHERE id=?").get(input.id) !== undefined)
    return { ok: false, reason: "mutation-reused", message: reusedMessage };
  const at = deps.clock.now().toISOString();
  transact(deps.db, () => {
    deps.db
      .prepare(
        "INSERT INTO design_templates (id,channel_id,head_version,created_at,mutation_id,mutation_hash) VALUES (?,?,1,?,?,?)",
      )
      .run(input.id, input.channelId ?? null, at, mutationId, hash);
    deps.db
      .prepare(
        "INSERT INTO design_template_revisions (template_id,version,name,document_json,created_at) VALUES (?,1,?,?,?)",
      )
      .run(input.id, input.name, JSON.stringify(input.document), at);
  });
  const template = getTemplate(deps.db, input.id);
  return template === undefined ? notFound : { ok: true, value: template };
}

// A Save on the version it was made on becomes the next version; one made on an older version
// is refused with the current template. Saving exactly what the head already holds is a no-op.
export function saveTemplate(
  deps: DesignDeps,
  templateId: string,
  raw: unknown,
): DesignResult<{
  readonly template: DesignTemplate;
  readonly saved: boolean;
  readonly before: DesignDocument;
}> {
  const parsed = saveTemplateSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const current = getTemplate(deps.db, templateId);
  if (current === undefined) return notFound;
  const input = parsed.data;
  const same =
    input.name === current.name &&
    JSON.stringify(input.document) === JSON.stringify(current.document);
  if (same)
    return { ok: true, value: { template: current, saved: false, before: current.document } };
  if (input.baseVersion !== current.headVersion)
    return {
      ok: false,
      reason: "changed",
      message:
        "This template was saved in another tab or by an agent. Reload it to see that version, then make your change again.",
      current,
    };
  const version = current.headVersion + 1;
  transact(deps.db, () => {
    deps.db
      .prepare(
        "INSERT INTO design_template_revisions (template_id,version,name,document_json,created_at) VALUES (?,?,?,?,?)",
      )
      .run(
        templateId,
        version,
        input.name,
        JSON.stringify(input.document),
        deps.clock.now().toISOString(),
      );
    deps.db
      .prepare("UPDATE design_templates SET head_version=? WHERE id=?")
      .run(version, templateId);
  });
  const template = getTemplate(deps.db, templateId);
  return template === undefined
    ? notFound
    : { ok: true, value: { template, saved: true, before: current.document } };
}

// Mark ready: the version's checks are run and kept; it is marked only when every one passes,
// and otherwise refused with the list.
export async function markTemplateReady(
  deps: DesignDeps,
  templateId: string,
  raw: unknown,
  more: (
    doc: DesignDocument,
    version: number,
  ) => Promise<readonly TemplateCheck[]> = async () => [],
): Promise<DesignResult<DesignTemplate>> {
  const parsed = markReadySchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, reason: "invalid", message: "Say which version to approve for schedules." };
  if (getTemplate(deps.db, templateId) === undefined) return notFound;
  const revision = templateRevision(deps.db, templateId, parsed.data.version);
  if (revision === undefined)
    return {
      ok: false,
      reason: "not-found",
      message: "That version of the template doesn't exist. Reload the template.",
    };
  const checks = [
    ...documentChecks(revision.document, templateId),
    ...(await more(revision.document, parsed.data.version)),
  ];
  const passed = checks.every((check) => check.ok);
  deps.db
    .prepare(
      "UPDATE design_template_revisions SET checks_json=?, gate=?, marked_at=? WHERE template_id=? AND version=?",
    )
    .run(
      JSON.stringify(checks),
      passed ? "ready" : revision.gate,
      passed ? deps.clock.now().toISOString() : revision.markedAt,
      templateId,
      parsed.data.version,
    );
  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0)
    return {
      ok: false,
      reason: "not-ready",
      message: `Version ${String(parsed.data.version)} can't be approved for schedules yet: ${failed.map((check) => check.sentence).join(" ")}`,
      current: failed,
    };
  const template = getTemplate(deps.db, templateId);
  return template === undefined ? notFound : { ok: true, value: template };
}

import { z } from "zod";
import type { StageKind } from "../../kernel/pipeline.js";
import type { PublicationRef } from "../../kernel/runner/work.js";
import { writeAsset } from "../storage/assets.js";
import type { OutputRole } from "../storage/model.js";
import { ensureBaseline } from "./adopt.js";
import type { RevisionDeps, RevisionView } from "./model.js";
import { saveRevision } from "./mutations.js";
import type { PreparedOutput } from "./publish.js";
import { revisionFixture } from "./revision.fake.js";

export async function mutationFixture(): Promise<
  ReturnType<typeof revisionFixture> & { readonly base: RevisionView }
> {
  const h = revisionFixture();
  const baseline = await ensureBaseline(h.deps, h.projectId);
  if (!baseline.ok) throw new Error("Expected baseline.");
  return { ...h, base: baseline.view };
}
export async function imageFixture(): Promise<
  ReturnType<typeof revisionFixture> & { readonly base: RevisionView }
> {
  const h = await mutationFixture();
  const result = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "images",
    edit: {
      config: {
        ...h.config,
        sources: { ...h.config.sources, images: "generate" },
        images: { provider: "image", model: "model" },
      },
      content: {
        ...h.base.revision.content,
        imageOrder: ["first", "second"],
        imageDefinitions: {
          first: { source: "generate", prompt: "First", assetId: null },
          second: { source: "generate", prompt: "Second", assetId: null },
        },
      },
    },
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return { ...h, base: result.view };
}
export function publicationFor(
  deps: RevisionDeps,
  view: RevisionView,
  key: string,
): PublicationRef {
  const row = z
    .object({
      id: z.string(),
      piece_id: z.string(),
      stage_id: z.string(),
      kind: z.string(),
      fingerprint: z.string(),
      revision_id: z.string(),
    })
    .parse(
      deps.db
        .prepare(
          "SELECT w.*,p.id AS piece_id FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id JOIN revision_work_reservations r ON r.piece_id=p.id WHERE r.revision_id=? AND p.work_key=?",
        )
        .get(view.revision.id, key),
    );
  return {
    pieceId: row.piece_id,
    publicationId: row.piece_id,
    work: {
      projectId: view.revision.projectId,
      revisionId: row.revision_id,
      workId: row.id,
      stageId: row.stage_id,
      kind: row.kind as StageKind,
      fingerprint: row.fingerprint,
    },
  };
}
export function preparedOutput(
  deps: RevisionDeps,
  publication: PublicationRef,
  key: string,
  role: OutputRole,
  slot = `${publication.work.kind}:${role}`,
): PreparedOutput {
  const asset = writeAsset(
    deps,
    publication.work.projectId,
    `${deps.ids.next()}.txt`,
    Buffer.from("Prepared result."),
  );
  return {
    slot,
    workKey: key,
    fingerprint: publication.work.fingerprint,
    asset,
    output: {
      id: deps.ids.next(),
      projectId: publication.work.projectId,
      stageKind: publication.work.kind,
      role,
      path: asset.path,
      originalFilename: null,
      bytes: asset.bytes,
      durationMs: null,
      meta: role === "image" ? { index: 1 } : {},
      createdAt: asset.createdAt,
    },
  };
}

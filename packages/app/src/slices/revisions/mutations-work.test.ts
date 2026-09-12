import { afterEach, expect, it } from "vitest";
import { planRevision } from "../rebuild/recipe-save.js";
import type { RevisionView } from "./model.js";
import { mutationFixture, preparedOutput, publicationFor } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { commitRevisionOutputs } from "./publish.js";
import { getRevisionView } from "./view.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
function request(view: RevisionView, key: string) {
  return {
    projectId: view.revision.projectId,
    baseRevisionId: view.revision.id,
    idempotencyKey: key,
  };
}
it.each([
  "title",
  "article",
  "voice",
  "chunking",
  "materialized-title",
  "materialized-voice",
] as const)(
  "%s edit correctly carries or revokes admitted future narration after article completion",
  async (change) => {
    const h = await mutationFixture();
    cleanups.push(h.close);
    const config = {
      ...h.config,
      sources: { ...h.config.sources, article: "generate" as const, audio: "generate" as const },
      llm: { provider: "text", model: "llm" },
      audio: { provider: "voice", model: "tts", voice: "one" },
      rendered: { article: "Write." },
    };
    const result = await saveRevision(h.deps, {
      ...request(h.base, "start"),
      edit: {
        config,
        content: { ...h.base.revision.content, promptTemplates: { article: "Write." } },
      },
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const future = publicationFor(h.deps, result.view, "audio:body:future");
    h.deps.db
      .prepare("UPDATE revision_work SET dispatch_state='allowed' WHERE id=?")
      .run(future.work.workId);
    h.deps.db
      .prepare("UPDATE revision_work_pieces SET dispatch_state='allowed' WHERE id=?")
      .run(future.pieceId);
    const article = publicationFor(h.deps, result.view, "article:body");
    commitRevisionOutputs(
      h.deps,
      article,
      [preparedOutput(h.deps, article, "article:body", "article_md")],
      [],
    );
    const fresh = getRevisionView(h.deps, h.projectId, result.view.revision.id);
    if (fresh === undefined) throw new Error("Missing current revision.");
    let physicalKey: string | undefined;
    if (change.startsWith("materialized")) {
      const planned = planRevision(fresh, {
        config: fresh.revision.config,
        content: fresh.revision.content,
      });
      if (!planned.ok) throw new Error("Expected resolved plan.");
      const part = planned.recipes.find((row) => row.input.kind === "tts");
      if (part === undefined) throw new Error("Expected resolved narration.");
      physicalKey = part.key;
      h.deps.db
        .prepare(
          "UPDATE revision_work_pieces SET work_key=?,fingerprint=?,request_fingerprint=?,input_json=?,logical_fingerprint=? WHERE id=?",
        )
        .run(
          part.key,
          part.fingerprint,
          part.requestFingerprint,
          JSON.stringify(part.input),
          part.logicalFingerprint,
          future.pieceId,
        );
      h.deps.db
        .prepare(
          "UPDATE revision_work_reservations SET work_key=?,fingerprint=?,logical_key='audio:body:future',desired_fingerprint=? WHERE piece_id=?",
        )
        .run(
          part.key,
          part.fingerprint,
          result.view.revision.fingerprints["audio:body:future"] ?? "",
          future.pieceId,
        );
    }
    const nextConfig = {
      ...fresh.revision.config,
      title: "New title",
      ...(change === "voice" || change === "materialized-voice"
        ? { audio: { provider: "voice", model: "tts", voice: "two" } }
        : {}),
      ...(change === "chunking"
        ? { chunking: { mode: "characters" as const, characters: 20 } }
        : {}),
    };
    const content =
      change === "article"
        ? { ...fresh.revision.content, promptTemplates: { article: "Write differently." } }
        : fresh.revision.content;
    const saved = await saveRevision(h.deps, {
      ...request(fresh, "edit"),
      edit: { config: nextConfig, content },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const carried = h.deps.db
      .prepare("SELECT piece_id FROM revision_work_reservations WHERE revision_id=? AND work_id=?")
      .get(saved.view.revision.id, future.work.workId);
    if (change === "title" || change === "materialized-title") {
      expect(carried).toEqual({ piece_id: future.pieceId });
      if (physicalKey !== undefined)
        expect(
          h.deps.db
            .prepare(
              "SELECT logical_key FROM revision_work_reservations WHERE revision_id=? AND piece_id=?",
            )
            .get(saved.view.revision.id, future.pieceId),
        ).toEqual({ logical_key: physicalKey });
      else
        expect(saved.view.revision.fingerprints["audio:body:future"]).toBe(
          result.view.revision.fingerprints["audio:body:future"],
        );
    } else expect(carried).toBeUndefined();
  },
);

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { buildRecipes } from "../rebuild/recipe-build.js";
import { executionPlan } from "../rebuild/runtime-plan.js";
import { writeAsset } from "../storage/assets.js";
import { insertOutput } from "../storage/repo.js";
import { ensureBaseline } from "./adopt.js";
import type { RevisionContent } from "./model.js";
import { mutationFixture } from "./mutation.fake.js";
import { validateAssetReferences } from "./mutation-assets.js";
import { saveRevision } from "./mutations.js";
import { insertAsset, insertManifestPiece, listRevisionHistory } from "./repo.js";
import { revisionFixture } from "./revision.fake.js";
import { getRevisionView } from "./view.js";

it.each(["thumbnail", "images", "audio", "narration"] as const)(
  "refuses retained instruction text as %s before preparing assets",
  async (destination) => {
    const h = revisionFixture();
    try {
      const kind = destination === "narration" ? "audio" : destination;
      const config: RunConfig = {
        ...h.config,
        sources: { ...h.config.sources, audio: "generate" },
        audio: { provider: "voice", model: "tts", voice: "v" },
      };
      h.deps.db
        .prepare("UPDATE projects SET config=? WHERE id=?")
        .run(JSON.stringify(config), h.projectId);
      const path = `${kind}-instructions.txt`;
      const projectPath = join(h.deps.paths.projects, h.projectId);
      writeFileSync(join(projectPath, path), "Request instructions.");
      insertOutput(h.deps.db, {
        id: "instructions",
        projectId: h.projectId,
        stageKind: kind,
        role: "instructions",
        path,
        originalFilename: null,
        bytes: 21,
        durationMs: null,
        meta: {},
        createdAt: h.deps.clock.now().toISOString(),
      });
      const baseline = await ensureBaseline(h.deps, h.projectId);
      if (!baseline.ok) throw new Error(JSON.stringify(baseline));
      const base = baseline.view;
      const source = base.outputs.find((row) => row.output.role === "instructions");
      if (source === undefined) throw new Error("Missing instruction asset.");
      const recipes = buildRecipes({
        config,
        content: base.revision.content,
        manifest: base,
        resolved: { articleMarkdown: base.articleMarkdown, researchNotes: null },
      });
      const narration = recipes.find((row) => row.input.kind === "tts");
      if (narration?.input.kind !== "tts") throw new Error("Missing narration recipe.");
      const key = narration.input.logicalKey;
      const content: RevisionContent =
        destination === "images"
          ? {
              ...base.revision.content,
              imageOrder: ["one"],
              imageDefinitions: {
                one: { source: "provide", assetId: source.assetId, prompt: null },
              },
            }
          : destination === "narration"
            ? {
                ...base.revision.content,
                narrationOverrides: { [key]: { kind: "asset", assetId: source.assetId } },
              }
            : {
                ...base.revision.content,
                provided: { ...base.revision.content.provided, [destination]: source.assetId },
              };
      const beforeAssets = h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all();
      const beforeFiles = readdirSync(projectPath, { recursive: true });
      let probes = 0;
      const result = await saveRevision(
        {
          ...h.deps,
          measureAudio: async () => {
            probes++;
            return 1000;
          },
        },
        {
          projectId: h.projectId,
          baseRevisionId: base.revision.id,
          idempotencyKey: "invalid-media",
          edit: {
            config: {
              ...config,
              sources: {
                ...config.sources,
                ...(destination === "narration" ? {} : { [destination]: "provide" }),
              },
            },
            content,
          },
        },
      );
      const field =
        destination === "images"
          ? "content.imageDefinitions.one.assetId"
          : destination === "narration"
            ? `content.narrationOverrides.${key}.assetId`
            : `content.provided.${destination}`;
      expect(result).toEqual({
        ok: false,
        reason: "invalid-edit",
        currentRevisionId: base.revision.id,
        fields: [{ field, message: "Choose an asset for this content stage." }],
      });
      expect(probes).toBe(0);
      expect(listRevisionHistory(h.deps.db, h.projectId)).toHaveLength(1);
      expect(h.deps.db.prepare("SELECT * FROM project_assets ORDER BY id").all()).toEqual(
        beforeAssets,
      );
      expect(readdirSync(projectPath, { recursive: true })).toEqual(beforeFiles);
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM revision_mutations").get()).toEqual({
        n: 0,
      });
      expect(getRevisionView(h.deps, h.projectId, base.revision.id)?.outputs).toEqual(base.outputs);
      expect(readFileSync(join(projectPath, path), "utf8")).toBe("Request instructions.");
    } finally {
      h.close();
    }
  },
);

it.each(["thumbnail", "images"] as const)(
  "accepts retained %s media without changing history",
  async (kind) => {
    const h = revisionFixture();
    try {
      const path = `${kind}.png`;
      writeFileSync(join(h.deps.paths.projects, h.projectId, path), "image");
      insertOutput(h.deps.db, {
        id: "media",
        projectId: h.projectId,
        stageKind: kind,
        role: kind === "images" ? "image" : "thumbnail",
        path,
        originalFilename: "original.png",
        bytes: 5,
        durationMs: null,
        meta: { index: 1 },
        createdAt: h.deps.clock.now().toISOString(),
      });
      const baseline = await ensureBaseline(h.deps, h.projectId);
      if (!baseline.ok) throw new Error(JSON.stringify(baseline));
      const base = baseline.view;
      const source = base.outputs.find((row) => row.output.path === path);
      if (source === undefined) throw new Error("Missing media.");
      const content =
        kind === "images"
          ? {
              ...base.revision.content,
              imageOrder: ["media"],
              imageDefinitions: {
                media: { source: "provide" as const, assetId: source.assetId, prompt: null },
              },
            }
          : {
              ...base.revision.content,
              provided: { ...base.revision.content.provided, thumbnail: source.assetId },
            };
      const result = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: base.revision.id,
        idempotencyKey: "valid-media",
        edit: {
          config: { ...h.config, sources: { ...h.config.sources, [kind]: "provide" } },
          content,
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(JSON.stringify(result));
      const plan = executionPlan(h.deps, result.view, {
        schemaVersion: 1,
        updatedAt: "2026-09-12",
        providers: {},
        llm: [],
        image: [],
        tts: [],
      });
      expect(
        plan.work.find((row) => row.key === (kind === "images" ? "image:media" : "thumbnail:image"))
          ?.disposition,
      ).toBe(kind === "images" ? "review" : "reuse");
      expect(getRevisionView(h.deps, h.projectId, base.revision.id)?.outputs).toEqual(base.outputs);
      expect(readFileSync(join(h.deps.paths.projects, h.projectId, path), "utf8")).toBe("image");
    } finally {
      h.close();
    }
  },
);

it.each([
  ["audio", "chunk", true],
  ["audio", "segment", true],
  ["audio", "article_written", false],
  ["images", "image", true],
  ["images", "prompt_written", false],
] as const)("validates retained %s piece kind %s", async (stageKind, kind, valid) => {
  const h = await mutationFixture();
  try {
    const asset = writeAsset(h.deps, h.projectId, "retained.bin", Buffer.from("retained"));
    insertAsset(h.deps.db, asset);
    insertManifestPiece(
      h.deps.db,
      h.base.revision,
      {
        key: "retained",
        stageKind,
        assetId: asset.id,
        fingerprint: "saved",
        piece: {
          id: "piece",
          stageId: "stage",
          kind,
          idx: 1,
          state: "done",
          payload: JSON.stringify({ file: asset.path }),
        },
      },
      "record",
    );
    const content: RevisionContent =
      stageKind === "audio"
        ? {
            ...h.base.revision.content,
            narrationOverrides: { "audio:body": { kind: "asset", assetId: asset.id } },
          }
        : {
            ...h.base.revision.content,
            imageOrder: ["one"],
            imageDefinitions: { one: { source: "provide", assetId: asset.id, prompt: null } },
          };
    expect(validateAssetReferences(h.deps, h.projectId, content, [])).toEqual(
      valid
        ? []
        : [
            {
              field:
                stageKind === "audio"
                  ? "content.narrationOverrides.audio:body.assetId"
                  : "content.imageDefinitions.one.assetId",
              message: "Choose an asset for this content stage.",
            },
          ],
    );
  } finally {
    h.close();
  }
});

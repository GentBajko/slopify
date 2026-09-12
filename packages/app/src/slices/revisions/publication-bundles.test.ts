import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { insertStagedFile } from "../storage/repo.js";
import { mutationFixture, preparedOutput, publicationFor } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { commitRevisionOutputs } from "./publish.js";
import { insertManifestOutput, selectOutputRecord } from "./repo.js";
import { getRevisionView } from "./view.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function fixture(video = false) {
  const h = await mutationFixture();
  cleanups.push(h.close);
  writeFileSync(join(h.deps.paths.staging, "audio"), "audio");
  insertStagedFile(h.deps.db, {
    id: "audio",
    stageKind: "audio",
    path: "audio",
    originalFilename: "audio.wav",
    bytes: 5,
    state: "staged",
    createdAt: "now",
  });
  const deps = { ...h.deps, measureAudio: async () => 4000 };
  const saved = await saveRevision(deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "audio",
    edit: {
      config: {
        ...h.config,
        sources: {
          ...h.config.sources,
          audio: "provide",
          ...(video ? { video: "generate" as const, images: "generate" as const } : {}),
        },
        images: { provider: "image", model: "model" },
        subtitles: {
          mode: "files",
          language: "en",
          fontId: "default",
          fontSize: 48,
          position: "bottom",
        },
      },
      content: {
        ...h.base.revision.content,
        ...(video
          ? {
              imageOrder: ["image"],
              imageDefinitions: {
                image: { source: "generate" as const, prompt: "A scene", assetId: null },
              },
            }
          : {}),
      },
      uploads: [{ stagedFileId: "audio", destination: { kind: "provided", stage: "audio" } }],
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  return { ...h, deps, base: saved.view };
}
it("publishes caption files with a new WAV descriptor while sharing the unchanged audio asset", async () => {
  const h = await fixture();
  const wavWork = publicationFor(h.deps, h.base, "export:wav");
  const wav = preparedOutput(h.deps, wavWork, "export:wav", "audio_export");
  commitRevisionOutputs(
    h.deps,
    wavWork,
    [wav, preparedOutput(h.deps, wavWork, "export:wav", "render_params")],
    [],
  );
  h.deps.db
    .prepare("UPDATE project_revisions SET fingerprints=? WHERE id=?")
    .run(
      JSON.stringify({ ...h.base.revision.fingerprints, "export:wav": "original-deferred-export" }),
      h.base.revision.id,
    );
  const captionWork = publicationFor(h.deps, h.base, "subtitles:files");
  const metadata = {
    ...wav,
    output: { ...wav.output, id: h.deps.ids.next(), meta: { subtitlesMode: "files" as const } },
  };
  const srt = preparedOutput(h.deps, captionWork, "subtitles:files", "subtitles_srt");
  const vtt = preparedOutput(h.deps, captionWork, "subtitles:files", "subtitles_vtt");
  expect(commitRevisionOutputs(h.deps, captionWork, [metadata, srt, vtt], []).currentAttached).toBe(
    true,
  );
  const view = getRevisionView(h.deps, h.projectId, h.base.revision.id);
  expect(
    view?.outputs.filter((row) => row.selected && row.output.role === "audio_export"),
  ).toMatchObject([{ assetId: wav.asset.id, output: { id: metadata.output.id } }]);
  expect(view?.outputs.filter((row) => row.output.role === "audio_export")).toHaveLength(2);
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
  expect(() => commitRevisionOutputs(h.deps, captionWork, [metadata, srt], [])).toThrow();
});
it("does not let a caption bundle replace newly selected WAV audio", async () => {
  const h = await fixture();
  const wavWork = publicationFor(h.deps, h.base, "export:wav");
  const wav = preparedOutput(h.deps, wavWork, "export:wav", "audio_export");
  commitRevisionOutputs(
    h.deps,
    wavWork,
    [wav, preparedOutput(h.deps, wavWork, "export:wav", "render_params")],
    [],
  );
  const next = preparedOutput(h.deps, wavWork, "export:wav", "audio_export");
  const record = h.deps.ids.next();
  h.deps.db
    .prepare("INSERT INTO project_assets(id,project_id,path,bytes,created_at) VALUES(?,?,?,?,?)")
    .run(next.asset.id, h.projectId, next.asset.path, next.asset.bytes, next.asset.createdAt);
  insertManifestOutput(
    h.deps.db,
    h.base.revision,
    {
      slot: next.slot,
      workKey: next.workKey,
      assetId: next.asset.id,
      output: next.output,
      fingerprint: next.fingerprint,
      state: "ready",
    },
    record,
  );
  selectOutputRecord(h.deps.db, h.base.revision.id, next.slot, record);
  const captionWork = publicationFor(h.deps, h.base, "subtitles:files");
  const metadata = {
    ...wav,
    output: { ...wav.output, id: h.deps.ids.next(), meta: { subtitlesMode: "files" as const } },
  };
  expect(
    commitRevisionOutputs(
      h.deps,
      captionWork,
      [
        metadata,
        preparedOutput(h.deps, captionWork, "subtitles:files", "subtitles_srt"),
        preparedOutput(h.deps, captionWork, "subtitles:files", "subtitles_vtt"),
      ],
      [],
    ).currentAttached,
  ).toBe(true);
  expect(
    getRevisionView(h.deps, h.projectId, h.base.revision.id)?.outputs.find(
      (row) => row.selected && row.output.role === "audio_export",
    )?.assetId,
  ).toBe(next.asset.id);
  expect(
    getRevisionView(h.deps, h.projectId, h.base.revision.id)?.outputs.filter(
      (row) => row.selected && ["subtitles_srt", "subtitles_vtt"].includes(row.output.role),
    ),
  ).toHaveLength(2);
});
it("requires video render parameters and every declared caption sidecar", async () => {
  const h = await fixture(true);
  const publication = publicationFor(h.deps, h.base, "export:video");
  const video = preparedOutput(h.deps, publication, "export:video", "video");
  expect(() => commitRevisionOutputs(h.deps, publication, [video], [])).toThrow("complete bundle");
  const media = {
    ...preparedOutput(h.deps, publication, "export:video", "video"),
    output: { ...video.output, id: h.deps.ids.next(), meta: { subtitlesMode: "files" as const } },
  };
  const validMedia = {
    ...media,
    output: { ...media.output, path: media.asset.path, bytes: media.asset.bytes },
  };
  const params = preparedOutput(h.deps, publication, "export:video", "render_params");
  expect(() => commitRevisionOutputs(h.deps, publication, [validMedia, params], [])).toThrow(
    "Declared subtitle files",
  );
});
it("complete article publication deselects omitted end matter without deleting history", async () => {
  const h = await mutationFixture();
  cleanups.push(h.close);
  const first = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "manual",
    edit: {
      config: h.config,
      content: {
        ...h.base.revision.content,
        articleMarkdown:
          "Article\n\n## Sources Consulted\n\nSources.\n\n## Pronunciation Glossary\n\nGlossary.",
      },
    },
  });
  if (!first.ok) throw new Error(JSON.stringify(first));
  const next = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: first.view.revision.id,
    idempotencyKey: "generate",
    edit: {
      config: {
        ...h.config,
        sources: { ...h.config.sources, article: "generate" },
        llm: { provider: "text", model: "llm" },
        rendered: { article: "Write." },
      },
      content: { ...first.view.revision.content, promptTemplates: { article: "Write." } },
      regenerate: ["article:body"],
    },
  });
  if (!next.ok) throw new Error(JSON.stringify(next));
  const publication = publicationFor(h.deps, next.view, "article:body");
  commitRevisionOutputs(
    h.deps,
    publication,
    [
      preparedOutput(h.deps, publication, "article:body", "article_md"),
      preparedOutput(h.deps, publication, "article:body", "article_txt"),
    ],
    [],
  );
  const view = getRevisionView(h.deps, h.projectId, next.view.revision.id);
  expect(
    view?.outputs.filter((row) => ["sources", "glossary"].includes(row.output.role)),
  ).toHaveLength(2);
  expect(
    view?.outputs.filter(
      (row) => row.selected && ["sources", "glossary"].includes(row.output.role),
    ),
  ).toHaveLength(0);
});

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { planRevision } from "../rebuild/recipe-save.js";
import { insertStagedFile } from "../storage/repo.js";
import type { RevisionDeps, RevisionView } from "./model.js";
import { mutationFixture } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
const subtitles = {
  mode: "files" as const,
  language: "en" as const,
  fontId: "default",
  fontSize: 48,
  position: "bottom" as const,
};
function upload(deps: RevisionDeps, id: string): void {
  writeFileSync(join(deps.paths.staging, id), id);
  insertStagedFile(deps.db, {
    id,
    stageKind: "audio",
    path: id,
    originalFilename: `${id}.wav`,
    bytes: id.length,
    state: "staged",
    createdAt: deps.clock.now().toISOString(),
  });
}
async function fixture() {
  const h = await mutationFixture();
  cleanups.push(h.close);
  return { ...h, deps: { ...h.deps, measureAudio: async () => 4000 } };
}
function request(view: RevisionView, key: string) {
  return {
    projectId: view.revision.projectId,
    baseRevisionId: view.revision.id,
    idempotencyKey: key,
  };
}
it("validates new cues against newly measured supplied audio and preserves that audio on later cue edits", async () => {
  const h = await fixture();
  upload(h.deps, "audio");
  const edit = {
    config: { ...h.config, sources: { ...h.config.sources, audio: "provide" as const }, subtitles },
    content: {
      ...h.base.revision.content,
      subtitleCues: {
        audioFingerprint: "client-old",
        cues: [{ id: "a", text: "Audio", start: 0, end: 4 }],
      },
    },
    uploads: [
      {
        stagedFileId: "audio",
        destination: { kind: "provided" as const, stage: "audio" as const },
      },
    ],
  };
  const bad = await saveRevision(h.deps, {
    ...request(h.base, "bad"),
    edit: {
      ...edit,
      content: {
        ...edit.content,
        subtitleCues: {
          ...edit.content.subtitleCues,
          cues: [{ id: "a", text: "Too long", start: 0, end: 6 }],
        },
      },
    },
  });
  expect(bad).toMatchObject({
    ok: false,
    reason: "invalid-edit",
    fields: [expect.objectContaining({ field: "content.subtitleCues.cues.0.end" })],
  });
  const saved = await saveRevision(h.deps, { ...request(h.base, "good"), edit });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  expect(saved.view.revision.content.subtitleCues?.audioFingerprint).not.toBe("client-old");
  const audio = saved.view.outputs.find((row) => row.output.role === "audio_body");
  const cues = saved.view.revision.content.subtitleCues;
  if (cues === undefined) throw new Error("Expected cues.");
  const changed = await saveRevision(h.deps, {
    ...request(saved.view, "caption"),
    edit: {
      config: saved.view.revision.config,
      content: {
        ...saved.view.revision.content,
        subtitleCues: { ...cues, cues: [{ id: "a", text: "Edited caption", start: 0, end: 3 }] },
      },
    },
  });
  if (!changed.ok) throw new Error(JSON.stringify(changed));
  expect(changed.view.outputs.find((row) => row.output.role === "audio_body")?.assetId).toBe(
    audio?.assetId,
  );
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
});
it("retains old cues after audio replacement without rejecting their old end time", async () => {
  const h = await fixture();
  upload(h.deps, "first");
  const first = await saveRevision(h.deps, {
    ...request(h.base, "first"),
    edit: {
      config: { ...h.config, sources: { ...h.config.sources, audio: "provide" }, subtitles },
      content: {
        ...h.base.revision.content,
        subtitleCues: {
          audioFingerprint: "old",
          cues: [{ id: "a", text: "Old", start: 0, end: 4 }],
        },
      },
      uploads: [{ stagedFileId: "first", destination: { kind: "provided", stage: "audio" } }],
    },
  });
  if (!first.ok) throw new Error(JSON.stringify(first));
  upload(h.deps, "second");
  const second = await saveRevision(
    { ...h.deps, measureAudio: async () => 1000 },
    {
      ...request(first.view, "second"),
      edit: {
        config: first.view.revision.config,
        content: first.view.revision.content,
        uploads: [{ stagedFileId: "second", destination: { kind: "provided", stage: "audio" } }],
      },
    },
  );
  if (!second.ok) throw new Error(JSON.stringify(second));
  expect(second.view.revision.content.subtitleCues).toEqual(
    first.view.revision.content.subtitleCues,
  );
  expect(second.view.revision.fingerprints["subtitles:timing"]).not.toBe(
    first.view.revision.content.subtitleCues?.audioFingerprint,
  );
});
it("stores a narration override without adding a second full-body output and measures proposed cues", async () => {
  const h = await fixture();
  const config = {
    ...h.config,
    sources: { ...h.config.sources, audio: "generate" as const },
    audio: { provider: "voice", model: "tts", voice: "narrator" },
    subtitles,
  };
  const planned = planRevision(h.base, { config, content: h.base.revision.content });
  if (!planned.ok) throw new Error(JSON.stringify(planned));
  const key = planned.recipes.find((row) => row.input.kind === "tts")?.key.replace(/:1$/, "");
  if (key === undefined) throw new Error("Expected narration key.");
  upload(h.deps, "part");
  const saved = await saveRevision(h.deps, {
    ...request(h.base, "part"),
    edit: {
      config,
      content: {
        ...h.base.revision.content,
        subtitleCues: {
          audioFingerprint: "pending",
          cues: [{ id: "a", text: "Audio", start: 0, end: 4 }],
        },
      },
      uploads: [{ stagedFileId: "part", destination: { kind: "narration", key } }],
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  expect(saved.view.outputs.filter((row) => row.output.role === "audio_body")).toHaveLength(0);
  expect(saved.view.revision.content.narrationOverrides[key]?.kind).toBe("asset");
  expect(saved.view.revision.content.subtitleCues?.audioFingerprint).not.toBe("pending");
});

it("records locally measured missing duration in a new descriptor without mutating retained history", async () => {
  const h = await fixture();
  upload(h.deps, "duration");
  const first = await saveRevision(h.deps, {
    ...request(h.base, "duration"),
    edit: {
      config: { ...h.config, sources: { ...h.config.sources, audio: "provide" }, subtitles },
      content: h.base.revision.content,
      uploads: [{ stagedFileId: "duration", destination: { kind: "provided", stage: "audio" } }],
    },
  });
  if (!first.ok) throw new Error(JSON.stringify(first));
  const audio = first.view.outputs.find((row) => row.output.role === "audio_body");
  if (audio === undefined) throw new Error("Expected audio.");
  h.deps.db
    .prepare(
      "UPDATE revision_outputs SET descriptor=json_set(descriptor,'$.durationMs',NULL) WHERE id=?",
    )
    .run(audio.recordId);
  const saved = await saveRevision(h.deps, {
    ...request(first.view, "cue"),
    edit: {
      config: first.view.revision.config,
      content: {
        ...first.view.revision.content,
        subtitleCues: {
          audioFingerprint: "old",
          cues: [{ id: "a", text: "Valid", start: 0, end: 4 }],
        },
      },
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  expect(saved.view.outputs.find((row) => row.output.role === "audio_body")?.output).toMatchObject({
    durationMs: 4000,
  });
  expect(
    h.deps.db
      .prepare(
        "SELECT json_extract(descriptor,'$.durationMs') AS duration FROM revision_outputs WHERE id=?",
      )
      .get(audio.recordId),
  ).toEqual({ duration: null });
});

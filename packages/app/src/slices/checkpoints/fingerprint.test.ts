import { expect, it } from "vitest";
import type { WorkRecipe } from "../rebuild/dependencies.js";
import { catalogue, config, content, emptyView } from "../rebuild/recipe-fixture.js";
import { planRevisionWork } from "../rebuild/recipe-work.js";
import type { ProjectRevision } from "../revisions/model.js";
import { checkpointClosure, checkpointFingerprint } from "./fingerprint.js";

const work: readonly WorkRecipe[] = [
  {
    key: "research",
    stage: "research",
    kind: "provider",
    requestFingerprint: "r",
    fingerprint: "r",
    dependsOn: [],
    unresolved: false,
  },
  {
    key: "article",
    stage: "article",
    kind: "provider",
    requestFingerprint: "a",
    fingerprint: "a",
    dependsOn: ["research"],
    unresolved: false,
  },
  {
    key: "audio",
    stage: "audio",
    kind: "provider",
    requestFingerprint: "s",
    fingerprint: "s",
    dependsOn: ["article"],
    unresolved: false,
  },
  {
    key: "images",
    stage: "images",
    kind: "provider",
    requestFingerprint: "i",
    fingerprint: "i",
    dependsOn: [],
    unresolved: false,
  },
  {
    key: "video",
    stage: "video",
    kind: "local",
    requestFingerprint: "v",
    fingerprint: "v",
    dependsOn: ["images", "audio"],
    unresolved: false,
  },
  {
    key: "captions",
    stage: "video",
    kind: "local",
    requestFingerprint: "c",
    fingerprint: "c",
    dependsOn: ["audio"],
    unresolved: false,
  },
];

it("holds a selected branch and all transitive dependents without holding its prerequisites", () => {
  expect(checkpointClosure("audio", work).map((row) => row.key)).toEqual([
    "audio",
    "captions",
    "video",
  ]);
  expect(checkpointClosure("images", work).map((row) => row.key)).toEqual(["images", "video"]);
  expect(checkpointClosure("video", work).map((row) => row.key)).toEqual(["captions", "video"]);
  expect(
    checkpointClosure(
      "audio",
      work.filter((row) => row.stage !== "audio"),
    ),
  ).toEqual([]);
});

it("traverses to a fixed point regardless of input ordering without changing source data", () => {
  const chained = [
    ...work,
    {
      ...work[0],
      key: "final",
      stage: "video",
      kind: "local",
      requestFingerprint: "f",
      fingerprint: "f",
      dependsOn: ["video"],
      unresolved: false,
    },
  ] satisfies readonly WorkRecipe[];
  const before = structuredClone(chained);
  expect(checkpointClosure("audio", [...chained].reverse()).map((row) => row.key)).toEqual([
    "audio",
    "captions",
    "final",
    "video",
  ]);
  expect(chained).toEqual(before);
});

it("canonically binds scoped work and dependency fingerprints, not revision IDs or unrelated fields", () => {
  const revision = emptyView().revision;
  const closure = checkpointClosure("audio", work);
  const first = checkpointFingerprint(revision, closure);
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(
    checkpointFingerprint(
      {
        ...revision,
        id: "new-revision",
        config: { ...revision.config, title: "Renamed" },
        fingerprints: { unrelated: "changed" },
      },
      [...closure].reverse().map((row) => ({ ...row, dependsOn: [...row.dependsOn].reverse() })),
    ),
  ).toBe(first);
  expect(checkpointFingerprint({ ...revision, projectId: "other-project" }, closure)).not.toBe(
    first,
  );
  expect(
    checkpointFingerprint({ ...revision, fingerprints: { article: "changed upstream" } }, closure),
  ).not.toBe(first);
  expect(
    checkpointFingerprint(
      revision,
      closure.map((row) =>
        row.key === "audio" ? { ...row, requestFingerprint: "changed request" } : row,
      ),
    ),
  ).not.toBe(first);
  expect(
    checkpointFingerprint(
      revision,
      closure.map((row) => (row.key === "video" ? { ...row, fingerprint: "changed export" } : row)),
    ),
  ).not.toBe(first);
});

it("uses the production recipe identities so voice and image edits invalidate only affected closures", () => {
  const base = emptyView({
    ...config,
    sources: { ...config.sources, audio: "generate", video: "off" },
  }).revision;
  const hashes = (revision: ProjectRevision) => {
    const plan = planRevisionWork(revision, { outputs: [], pieces: [] }, catalogue, new Set(), {
      articleMarkdown: revision.content.articleMarkdown ?? null,
      researchNotes: null,
    });
    return Object.fromEntries(
      (["audio", "images", "video"] as const).map((stage) => [
        stage,
        checkpointFingerprint(revision, checkpointClosure(stage, plan.recipes)),
      ]),
    );
  };
  const original = hashes(base);
  const voice = hashes({
    ...base,
    config: { ...base.config, audio: { provider: "voice", model: "tts", voice: "different" } },
  });
  expect(voice.audio).not.toBe(original.audio);
  expect(voice.video).not.toBe(original.video);
  expect(voice.images).toBe(original.images);
  const image = content.imageDefinitions.harbor;
  if (!image) throw new Error("Missing fixture image");
  const images = hashes({
    ...base,
    content: {
      ...base.content,
      imageDefinitions: {
        ...base.content.imageDefinitions,
        harbor: { ...image, prompt: "Changed scene" },
      },
    },
  });
  expect(images.images).not.toBe(original.images);
  expect(images.audio).toBe(original.audio);
  expect(images.video).toBe(original.video);
  expect(hashes({ ...base, config: { ...base.config, title: "Only a title" } })).toEqual(original);
});

import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import type { StagedFile } from "@/api";
import { revisionView } from "./revision-fixture.js";
import { formOfRevision } from "./revision-form-state.js";
export function imageEdit(): RevisionEdit {
  const base = formOfRevision(revisionView());
  return {
    ...base,
    config: {
      ...base.config,
      sources: { ...base.config.sources, images: "generate", video: "generate" },
    },
    content: {
      ...base.content,
      imageOrder: ["i1", "i2"],
      imageDefinitions: {
        i1: { source: "generate", assetId: "a1", prompt: "Saved scene" },
        i2: { source: "provide", assetId: "a2", prompt: null },
      },
    },
  };
}
export function narrationView(texts: readonly string[] = ["Hello", "Hello"]): RevisionView {
  const base = revisionView();
  return {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "generate" },
      },
    },
    pieces: texts.map((logicalText, index) => ({
      recordId: `rp${index}`,
      publicationId: null,
      selected: true,
      available: true,
      key: `audio:body:chunk1:${index + 1}`,
      stageKind: "audio",
      assetId: `a${index}`,
      fingerprint: `fp${index}`,
      piece: {
        id: `piece${index}`,
        stageId: "s-audio",
        kind: "chunk",
        idx: index,
        state: "done",
        payload: JSON.stringify({
          logicalKey: "audio:body:chunk1",
          logicalText,
          segment: "body",
          text: `Part ${index}`,
        }),
      },
    })),
  };
}
export const staged: StagedFile = {
  id: "upload1",
  stageKind: "images",
  path: "upload1.png",
  originalFilename: "scene.png",
  bytes: 3,
  state: "staged",
  createdAt: "2026-09-12T00:00:00.000Z",
};
export function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve = (_value: T): void => {
    throw new Error("Promise not initialized");
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
export function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

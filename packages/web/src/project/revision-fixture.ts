import type { RevisionView } from "@app/slices/revisions/model.js";
export function revisionView(id = "r1", title = "Saved"): RevisionView {
  return {
    current: true,
    articleMarkdown: "Saved article.",
    outputs: [],
    pieces: [],
    revision: {
      id,
      projectId: "p1",
      parentId: null,
      restoredFromId: null,
      createdAt: "2026-09-10T00:00:00.000Z",
      fingerprints: {},
      config: {
        title,
        format: "16:9",
        imagePrompts: [],
        values: {},
        rendered: {},
        provided: { article: "Saved article." },
        silenceGapSeconds: 0,
        imageSeconds: 15,
        zoomPercent: 22.5,
        edgeSilenceSeconds: 0,
        sources: {
          research: "off",
          article: "provide",
          audio: "off",
          images: "off",
          thumbnail: "off",
          video: "off",
        },
      },
      content: {
        articleMarkdown: "Saved article.",
        provided: {},
        imageOrder: [],
        imageDefinitions: {},
        narrationOverrides: {},
        regenerationTokens: {},
        promptTemplates: {},
      },
    },
  };
}

import type { StageKind, StageState } from "@app/kernel/pipeline.js";
import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import type { Answer } from "@/test-app";
import { jsonAnswer, testDeps, testVersion } from "@/test-app";

// The rows, outputs and route table the project page's tests are all built from. They sit
// beside those tests rather than inside one of them, because the page is checked from two
// angles - what it draws, and what its controls do - and both need the same finished run.

export function stage(kind: StageKind, state: StageState, over: Partial<Stage> = {}): Stage {
  return {
    id: `s-${kind}`,
    projectId: "p1",
    kind,
    source: state === "provided" ? "provide" : state === "skipped" ? "off" : "generate",
    state,
    failureReason: null,
    attemptCount: 0,
    progressCurrent: state === "running" ? 1 : null,
    progressTotal: state === "running" ? 4 : null,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

export function output(
  role: Output["role"],
  stageKind: StageKind,
  over: Partial<Output> = {},
): Output {
  return {
    id: `o-${role}-${String(over.meta?.index ?? 0)}`,
    projectId: "p1",
    stageKind,
    role,
    path: `${role}.bin`,
    originalFilename: null,
    bytes: 12,
    durationMs: null,
    meta: {},
    createdAt: "2026-09-03T00:00:00.000Z",
    ...over,
  };
}

export function body(options: {
  readonly status: "running" | "done" | "failed" | "canceled";
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
}) {
  return {
    project: {
      id: "p1",
      title: "Rope Tricks",
      format: "16:9",
      status: options.status,
      config: {
        title: "Rope Tricks",
        format: "16:9",
        articlePrompt: "Documentary dossier",
        imagePrompts: [{ name: "Oil painting scenes", number: 2 }],
        sources: {
          research: "generate",
          article: "generate",
          audio: "generate",
          images: "generate",
          thumbnail: "from_prompt",
          video: "generate",
        },
        llm: { provider: "openrouter", model: "m" },
        audio: { provider: "elevenlabs", model: "v3", voice: "narrator-m" },
        images: { provider: "fal", model: "flux" },
        chunking: { mode: "words", words: 500 },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    stages: options.stages,
    outputs: options.outputs,
  };
}

export const twoImages = [
  output("image", "images", { meta: { promptName: "Oil painting scenes", index: 1 } }),
  output("image", "images", { meta: { promptName: "Oil painting scenes", index: 2 } }),
];

export const finished = body({
  status: "done",
  stages: [
    stage("research", "skipped"),
    stage("article", "done"),
    stage("audio", "done"),
    stage("images", "done"),
    stage("thumbnail", "done"),
    stage("video", "done"),
  ],
  outputs: [
    output("article_md", "article"),
    output("sources", "article"),
    output("glossary", "article"),
    output("audio_intro", "audio", { durationMs: 7000 }),
    output("audio_body", "audio", { durationMs: 60_000 }),
    output("audio_outro", "audio", { durationMs: 5000 }),
    ...twoImages,
    output("thumbnail", "thumbnail", { meta: { prompt: "A cracked skull with gemstone eyes" } }),
    output("video", "video", { durationMs: 72_000 }),
  ],
});

export const ready = [
  {
    id: "openrouter",
    family: "llm",
    displayName: "OpenRouter",
    readiness: { kind: "keyed", hasKey: true },
  },
  {
    id: "elevenlabs",
    family: "tts",
    displayName: "ElevenLabs",
    readiness: { kind: "keyed", hasKey: true },
  },
  { id: "fal", family: "image", displayName: "fal.ai", readiness: { kind: "keyed", hasKey: true } },
];

export function deps(routes: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/projects/p1": jsonAnswer(finished),
    "GET /api/providers": jsonAnswer({ providers: ready }),
    "GET /api/prompts": jsonAnswer({
      prompts: [{ id: "t1", kind: "article", name: "Documentary dossier", body: "b" }],
    }),
    "GET /api/settings/voices": jsonAnswer({
      voices: [{ id: "v1", provider: "elevenlabs", name: "Narrator M", voiceId: "narrator-m" }],
    }),
    "GET /files/p1/article-md": textAnswer("# The Archlich\n\nMost villains want something."),
    "GET /files/p1/notes": textAnswer("Chapter 1 of 7."),
    ...routes,
  });
}

function textAnswer(text: string): Answer {
  return () =>
    new Response(text, {
      status: 200,
      headers: { "content-type": "text/plain", "X-Slopify-Version": testVersion },
    });
}

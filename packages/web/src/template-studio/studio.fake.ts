import { templateSections } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import { freshDraftDocument } from "@/play/draft-state";
import { jsonAnswer } from "@/test-app";

// One template's Edit template page as the server answers it, for its page tests and help walk.
export const templateId = "33333333-3333-4333-8333-333333333333";
export const labels = [
  "Title and keywords",
  "Article",
  "Narration",
  "Images",
  "Video and style",
  "Thumbnail",
  "Shorts",
  "PDF",
  "Pauses and checks",
  "YouTube description and posts",
  "Schedule",
];
export const document = {
  ...freshDraftDocument,
  form: {
    ...freshDraftDocument.form,
    title: "History: {{Topic}}",
    llm: { provider: "openrouter", model: "claude" },
  },
};
export const view: StudioView = {
  template: {
    id: templateId,
    name: "Weekly documentary",
    version: 3,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    document,
  },
  gate: "unchecked",
  runnableVersion: 2,
  gated: true,
  checkedVersion: 2,
  sample: { topic: "The history of the lighthouse", topicSource: "fixed", fullScript: false },
  sections: templateSections.map((id, index) => ({
    id,
    label: labels[index] ?? id,
    state: id === "thumbnail" ? "off" : "stale",
    sentence:
      id === "thumbnail"
        ? "The thumbnail is off."
        : "Make sample shows what this section makes, about the sample topic.",
  })),
  free: {
    video: {
      state: "current",
      sentence: "30 seconds in your frame.",
      url: "/api/style-preview/abc.mp4?v=1",
    },
    loudness: {
      state: "current",
      sentence: "Before and after.",
      url: `/api/template-studio/${templateId}/loudness/after.mp3?v=1`,
      beforeUrl: `/api/template-studio/${templateId}/loudness/before.mp3`,
      beforeLufs: -19.4,
      afterLufs: -14,
      targetLufs: -14,
      ceiling: -2.5,
    },
    document: { state: "off", sentence: "The PDF is off.", url: null },
  },
  schedule: {
    runs: [
      {
        at: "2026-10-19T20:00:00.000Z",
        scheduleId: "s1",
        scheduleName: "Weekdays",
        title: "History: Salt roads",
        topic: true,
        paused: false,
      },
    ],
    cost: {
      runs: 8.7,
      high: 4.35,
      unknown: 0,
      problem: null,
      paused: { schedules: 0, runs: 0, high: 0 },
    },
  },
  paid: {
    projectId: null,
    revisionId: null,
    state: null,
    sentence: null,
    quotedHigh: null,
    article: null,
    outputs: [],
    versions: [],
  },
  reviews: [
    {
      id: "checkpoint:video",
      name: "Before the video",
      kind: "checkpoint",
      by: "you",
      detail: "The run waits here until you approve it.",
    },
  ],
};
export const checks = {
  version: 3,
  checks: [
    { id: "keywords", ok: true, sentence: "Every keyword has a value or is filled per video." },
    {
      id: "providers",
      ok: false,
      sentence: "No voice service is chosen, so a run can't start.",
      fix: { label: "Choose one in Narration", href: `/templates/${templateId}?section=voice` },
    },
  ],
};
export const routes = {
  [`GET /api/template-studio/${templateId}`]: jsonAnswer(view),
  [`GET /api/template-studio/${templateId}/checks`]: jsonAnswer(checks),
  "GET /api/providers": jsonAnswer({
    providers: [
      {
        id: "openrouter",
        family: "llm",
        displayName: "OpenRouter",
        readiness: { kind: "keyed", hasKey: true },
      },
    ],
  }),
};

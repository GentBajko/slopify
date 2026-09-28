import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import type { RevisionOutputView, RevisionView } from "@app/slices/revisions/model.js";
import { revisionViewSchema } from "@app/slices/revisions/schema.js";
import type { UploadPack } from "@app/slices/studio/model.js";
import { defaultVideoEdit } from "@app/slices/video/edit-settings.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { selfExplanatory, unexplainedControls } from "@/help/coverage";
import { RebuildReview } from "@/project/rebuild-review";
import { revisionView } from "@/project/revision-fixture";
import { ProjectRoute } from "@/routes/project";
import { body, deps, finished, output, stage } from "@/routes/project-fixtures";
import { revisionRouteFixture } from "@/routes/project-revision.fake";
import { ProjectsRoute } from "@/routes/projects";
import { PrepareUpload } from "@/studio/prepare-upload";
import {
  jsonAnswer,
  openEditSection,
  openProjectEditor,
  openProjectSection,
  renderApp,
  renderRouted,
  testDeps,
} from "@/test-app";

// Every control a person meets on the project page, in Edit project, the rebuild review and
// Prepare upload has an info button beside it (help/coverage.ts).

afterEach(cleanup);

const allow: readonly (string | RegExp)[] = [
  // The project's own name; the label says all there is to it.
  "Project title",
  // Prepare upload's per-step ticks are a note to self in this browser, one per row; the
  // "In the order Studio asks" heading's tip explains them.
  / done$/,
  // Projects' Show filter only narrows the list on screen.
  "Show",
];

function unexplained(): readonly string[] {
  return unexplainedControls(document.body, [...selfExplanatory, ...allow]).map(
    (control) => control.name,
  );
}

function ready(workKey: string, role: RevisionOutputView["output"]["role"], durationMs: number) {
  const id = workKey.replace(/:/g, "-");
  return {
    recordId: id,
    publicationId: null,
    selected: true,
    slot: role,
    workKey,
    assetId: id,
    fingerprint: id,
    state: "ready" as const,
    available: true,
    output: {
      id,
      projectId: "p1",
      stageKind: role === "subtitle_words" ? ("video" as const) : ("audio" as const),
      role,
      path: workKey,
      originalFilename: null,
      bytes: 10,
      durationMs,
      meta: {},
      createdAt: "2026-09-10T00:00:00.000Z",
    },
  };
}

// A project with every setting Edit project can show switched on: research notes, the Look
// and animated images, an ambient bed, more images for long videos, burned-in captions,
// shorts with a pick, reviews, a YouTube description, a narration chunk, an image and
// caption cues to edit.
function everything(): RevisionView {
  const base = revisionView();
  const sentences = Array.from({ length: 10 }, (_value, at) => ({
    start: at * 10,
    end: at * 10 + 9.5,
    text: `Sentence ${String(at + 1)}.`,
  }));
  const clip = (number: number, first: number, last: number) => ({
    number,
    first,
    last,
    start: (first - 1) * 10,
    end: (last - 1) * 10 + 9.5,
    title: `Short ${String(number)}`,
    description: "One line.",
    hashtags: ["#One"],
    why: "",
    text: "Said.",
    seed: null,
  });
  const outputs = [
    ready("audio:intro", "audio_intro", 5000),
    ready("audio:body:concat", "audio_body", 100_000),
    ready("subtitles:timing", "subtitle_words", 0),
  ];
  return revisionViewSchema.parse({
    ...base,
    outputs,
    pieces: [
      {
        recordId: "pick",
        publicationId: null,
        selected: true,
        available: true,
        key: "shorts:pick",
        stageKind: "video",
        assetId: null,
        fingerprint: "pick",
        piece: {
          id: "pick",
          stageId: "s-video",
          kind: "article_written",
          idx: 10000,
          state: "done",
          payload: JSON.stringify({
            shorts: [clip(1, 2, 4), clip(2, 7, 9)],
            durationSeconds: 100,
            sentences,
          }),
        },
      },
      {
        recordId: "chunk",
        publicationId: null,
        selected: true,
        available: true,
        key: "audio:body:chunk1:1",
        stageKind: "audio",
        assetId: "a0",
        fingerprint: "chunk",
        piece: {
          id: "chunk",
          stageId: "s-audio",
          kind: "chunk",
          idx: 0,
          state: "done",
          payload: JSON.stringify({
            logicalKey: "audio:body:chunk1",
            logicalText: "Hello there.",
            segment: "body",
            text: "Hello there.",
          }),
        },
      },
    ],
    revision: {
      ...base.revision,
      fingerprints: Object.fromEntries(outputs.map((row) => [row.workKey, row.fingerprint])),
      config: {
        ...base.revision.config,
        title: "Rope Tricks",
        sources: {
          research: "provide",
          article: "generate",
          audio: "generate",
          images: "generate",
          thumbnail: "from_prompt",
          video: "generate",
          document: "generate",
        },
        provided: { research: "Notes." },
        imagePrompts: [{ name: "Oil painting scenes", number: 2 }],
        llm: { provider: "openrouter", model: "m" },
        audio: { provider: "elevenlabs", model: "v3", voice: "narrator-m" },
        images: { provider: "fal", model: "flux" },
        chunking: { mode: "words", words: 500 },
        intro: { name: "Hello", mode: "text" },
        subtitles: {
          mode: "burn-in",
          language: "en",
          fontId: "default",
          fontSize: 48,
          position: "bottom",
        },
        shorts: { enabled: true, count: 2, minSeconds: 20, maxSeconds: 40 },
        reviews: {
          provider: "openrouter",
          model: "m",
          stages: { article: { mode: "flag" } },
        },
        youtubeDescription: true,
        videoEdit: { ...defaultVideoEdit, animate: "every" },
        ambientBed: { source: "rain", levelDb: -18, fadeInSeconds: 3, tailSeconds: 6 },
        imageScale: { perHour: 30, words: 1500 },
        reference: { source: "prompt", prompt: "Oil painting scenes" },
      },
      content: {
        ...base.revision.content,
        articleMarkdown: "# One\n\nHello there.",
        imageOrder: ["i1"],
        imageDefinitions: { i1: { source: "generate", assetId: null, prompt: "A rope" } },
        subtitleCues: {
          audioFingerprint: "subtitles-timing",
          cues: [{ id: "c1", text: "Hello there.", start: 0, end: 2 }],
        },
      },
    },
  });
}

function richRoutes() {
  const view = everything();
  const fixture = revisionRouteFixture(finished);
  return deps({
    ...fixture.routes,
    "GET /api/projects/p1": jsonAnswer({
      ...finished,
      revisionId: "r1",
      project: { ...finished.project, config: view.revision.config },
    }),
    "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
    "POST /api/projects/p1/revisions/prepare": jsonAnswer({ ok: true, view, created: false }),
    "GET /api/prompts": jsonAnswer({
      prompts: [
        { id: "t1", kind: "article", name: "Documentary dossier", body: "b", slots: [] },
        { id: "t2", kind: "image", name: "Oil painting scenes", body: "b", slots: [] },
      ],
    }),
    "GET /api/entries": jsonAnswer({
      entries: [{ id: "e1", category: "intro", name: "Hello", mode: "text", body: "Hi." }],
    }),
  });
}

describe("the project page", () => {
  it("explains every control in each section of a finished project", async () => {
    const fixture = revisionRouteFixture(finished);
    renderRouted(<ProjectRoute projectId="p1" />, fixture.app);
    for (const section of ["Article", "Narration", "Images", "Video", "Cost", "Live", "History"]) {
      await openProjectSection(section);
      expect({ section, unexplained: unexplained() }).toEqual({ section, unexplained: [] });
    }
  });

  it("explains the checkpoint choices of a paused project", async () => {
    const paused = body({
      status: "paused",
      stages: [stage("article", "done"), stage("audio", "pending"), stage("video", "pending")],
      outputs: [output("article_md", "article")],
    });
    const fixture = revisionRouteFixture(paused);
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fixture.routes,
        "GET /api/projects/p1/checkpoints": jsonAnswer({ revisionId: "r1", checkpoints: [] }),
      }),
    );
    await openProjectSection("Checkpoints");
    await screen.findByRole("group", { name: "Checkpoint choices" });
    expect(unexplained()).toEqual([]);
  });
});

describe("Edit project", () => {
  it("explains every control in every section, with every setting on", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, richRoutes());
    await openProjectEditor();
    const nav = await screen.findByRole("navigation", { name: "Edit sections" });
    const sections = within(nav)
      .getAllByRole("button")
      .map((button) => button.firstChild?.textContent ?? "");
    expect(sections).toEqual([
      "Inputs",
      "Article",
      "Providers",
      "Prompts",
      "Reviews",
      "Shorts",
      "Subtitles",
      "Images",
      "Narration",
      "Captions",
    ]);
    const found: Record<string, readonly string[]> = {};
    for (const section of sections) {
      await openEditSection(section);
      if (section === "Inputs") {
        // The Look opens to the rest of the video edit.
        const look = screen.getByText("Look").closest("details");
        if (look !== null) look.open = true;
      }
      if (section === "Shorts")
        await userEvent.click(
          screen.getAllByRole("button", { name: "Use my own range" })[0] ?? document.body,
        );
      found[section] = unexplained();
      if (section === "Captions") screen.getByRole("region", { name: "Edit caption cues" });
    }
    expect(found).toEqual(Object.fromEntries(sections.map((section) => [section, []])));
  });

  it("explains the choices the rebuild review asks for", () => {
    const preview: RebuildPreview = {
      id: "pv1",
      projectId: "p1",
      baseRevisionId: "r1",
      planFingerprint: "f1",
      selection: { kind: "allAffected" },
      changedInputs: [],
      retained: [],
      warnings: [],
      wholeRequestNotice: null,
      providedReuseRequired: ["audio:provided"],
      work: [
        {
          key: "audio:provided",
          stage: "audio",
          kind: "provided",
          disposition: "review",
          requestFingerprint: "q",
          fingerprint: "f",
          dependsOn: [],
          reason: "Transcript changed",
          inflight: false,
          pieceIds: [],
        },
      ],
      costs: {
        currency: "USD",
        rows: [],
        low: 0,
        high: 0,
        unknown: 1,
        expectedWords: 20,
        catalogueDate: null,
        assumptions: [],
      },
    };
    render(
      <RebuildReview preview={preview} pending={false} onStart={() => {}} onCancel={() => {}} />,
    );
    expect(unexplained()).toEqual([]);
  });
});

describe("Prepare upload and the project list", () => {
  it("explains the upload pack's choices", async () => {
    const file = (asset: string, filename: string) => ({
      url: `/files/p1/${asset}`,
      asset,
      filename,
      contentType: "image/png",
      bytes: 3,
    });
    const pack: UploadPack = {
      projectId: "p1",
      projectTitle: "The Fox",
      missing: [],
      footage: { clips: 1, real: false },
      items: [
        {
          kind: "video",
          video: { ...file("video", "fox.mp4"), contentType: "video/mp4" },
          title: "The Fox",
          titles: [],
          description: "A fox.",
          tags: ["fox"],
          thumbnails: [file("thumbnail", "t.png")],
          audience: "not_made_for_kids",
          alteredContent: { altered: false, why: "No." },
          playlist: null,
        },
        {
          kind: "short",
          short: 1,
          video: null,
          title: "The jump",
          titles: [],
          description: "Leap.",
          tags: ["fox"],
          thumbnails: [],
          audience: "not_made_for_kids",
          alteredContent: { altered: false, why: "No." },
          playlist: null,
        },
      ],
    };
    renderApp(
      <PrepareUpload projectId="p1" ready />,
      testDeps({ "GET /api/studio/packs/p1": jsonAnswer(pack) }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Prepare upload" }));
    const drawer = await screen.findByRole("dialog", { name: "Prepare upload" });
    await within(drawer).findByText("fox.mp4");
    expect(unexplained()).toEqual([]);
  });

  it("explains the project list's controls", async () => {
    const project = {
      id: "p1",
      title: "Rope Tricks",
      status: "done",
      progress: 1,
      format: "16:9",
      channelId: "00000000-0000-4000-8000-000000000001",
      uploadedAt: null,
      config: finished.project.config,
      createdAt: "2026-09-02T19:14:00.000Z",
      updatedAt: "2026-09-02T19:14:00.000Z",
    };
    renderRouted(
      <ProjectsRoute />,
      testDeps({ "GET /api/projects": jsonAnswer({ projects: [project] }) }),
    );
    await screen.findByRole("group", { name: "Show" });
    expect(unexplained()).toEqual([]);
  });
});

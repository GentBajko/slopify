import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import type { RevisionOutputView, RevisionView } from "@app/slices/revisions/model.js";
import { revisionViewSchema } from "@app/slices/revisions/schema.js";
import type { UploadPack } from "@app/slices/studio/model.js";
import { defaultVideoEdit } from "@app/slices/video/edit-settings.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { selfExplanatory, unexplainedControls } from "@/help/coverage";
import { YoutubeBlock } from "@/project/body-youtube";
import { RebuildReview } from "@/project/rebuild-review";
import { revisionView } from "@/project/revision-fixture";
import { RevisionMedia } from "@/project/revision-media";
import { ProjectRoute } from "@/routes/project";
import { body, deps, finished, output, stage } from "@/routes/project-fixtures";
import { revisionRouteFixture } from "@/routes/project-revision.fake";
import { ProjectsRoute } from "@/routes/projects";
import { packs, redditPack, xPack } from "@/social/post.fake";
import { PrepareUpload } from "@/studio/prepare-upload";
import {
  jsonAnswer,
  openEditSection,
  openProjectEditor,
  openProjectSection,
  renderRouted,
  testDeps,
} from "@/test-app";

// Every control a person meets on the project page, in Edit project, the rebuild review and
// Copy for YouTube Studio is explained beside it, by a visible help line or an info button
// (help/coverage.ts).

afterEach(cleanup);

const allow: readonly (string | RegExp)[] = [
  // The project's own name; the label says all there is to it.
  "Project title",
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
    for (const section of [
      "Article",
      "Narration",
      "Images",
      "Video",
      "All files",
      "Cost",
      "Versions",
    ]) {
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
    await openProjectSection("Pauses and checks");
    await screen.findByRole("group", { name: "Pauses for this run" });
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
    // Create's sections, in Create's order and words.
    expect(sections).toEqual([
      "Title and keywords",
      "Article",
      "Narration",
      "Images",
      "Video and style",
      "Captions",
      "Outputs",
      "Pauses and checks",
      "Channel",
    ]);
    const found: Record<string, readonly string[]> = {};
    for (const section of sections) {
      await openEditSection(section);
      if (section === "Video and style") {
        // The Look and Sound polish open to the rest of the video edit.
        for (const name of ["Look", "Sound polish"]) {
          const fold = screen.getByText(name).closest("details");
          if (fold !== null) fold.open = true;
        }
      }
      if (section === "Outputs")
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

describe("Copy for YouTube Studio, the YouTube section and the project list", () => {
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
      series: "",
      missing: [],
      playlistChoices: [],
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
          playlists: [],
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
          playlists: [],
          playlist: null,
        },
      ],
    };
    renderRouted(
      <PrepareUpload projectId="p1" ready />,
      testDeps({
        "GET /api/studio/packs/p1": jsonAnswer(pack),
        "GET /api/social/packs/p1": jsonAnswer(packs([xPack, redditPack])),
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Copy for YouTube Studio" }));
    const drawer = await screen.findByRole("dialog", { name: "Copy for YouTube Studio" });
    await within(drawer).findByText("fox.mp4");
    expect(unexplained()).toEqual([]);
    // Each other site's post: its words, settings, link and, for Reddit, its own fields.
    await userEvent.click(within(drawer).getByRole("button", { name: "X" }));
    await within(drawer).findByLabelText("X post");
    expect(unexplained()).toEqual([]);
    await userEvent.click(within(drawer).getByRole("button", { name: "Reddit" }));
    await within(drawer).findByLabelText("Subreddit");
    expect(unexplained()).toEqual([]);
  });

  it("explains the YouTube section's dates, links and editors", async () => {
    const video = stage("video", "done");
    const outputs = [output("youtube_description", "video"), output("youtube_tags", "video")];
    const project = {
      ...body({ status: "done", stages: [video], outputs }).project,
      format: "16:9" as const,
      config: { ...revisionView().revision.config, youtubeDescription: true },
    };
    const view = {
      ...revisionView(),
      outputs: outputs.map((one) => ({
        recordId: one.role,
        publicationId: null,
        selected: true,
        available: true,
        slot: `video:${one.role}`,
        workKey: "youtube:description",
        assetId: one.id,
        output: one,
        fingerprint: "youtube",
        state: "ready" as const,
      })),
    };
    renderRouted(
      <RevisionMedia projectId="p1" revisionId="r1">
        <YoutubeBlock stage={video} project={project} outputs={outputs} />
      </RevisionMedia>,
      testDeps({
        "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
        "GET /files/p1/revisions/r1/youtube_description": () =>
          new Response("Rope.\n\n0:00 A\n0:20 B\n0:40 C\n\n#Rope"),
        "GET /files/p1/revisions/r1/youtube_tags": () => new Response("rope"),
        "GET /api/projects/p1/youtube-edits": jsonAnswer({ fields: {}, links: [] }),
        "GET /api/projects/p1/channel-links": jsonAnswer({ channelId: "c1", links: [] }),
        "GET /api/studio/videos/p1": jsonAnswer({ videos: [] }),
        "GET /api/studio/releases": jsonAnswer({
          entries: [{ at: "2036-10-11T18:00:00.000Z", project: { id: "p2", title: "Two" } }],
        }),
        "GET /api/studio/releases/p1": jsonAnswer({
          leadHours: 24,
          items: [
            {
              short: 0,
              title: "Rope",
              at: "2036-10-10T18:00:00.000Z",
              uploadBy: "2036-10-09T18:00:00.000Z",
              onYoutube: false,
            },
          ],
          free: [{ row: "line-1", longAt: "2036-10-12T18:00:00.000Z" }],
        }),
      }),
    );
    await screen.findByLabelText("Video release date");
    await screen.findByRole("textbox", { name: "Video link" });
    const plan = screen.getByText("Posting plan").closest("details");
    if (plan !== null) plan.open = true;
    expect(unexplained()).toEqual([]);
    await userEvent.click(await screen.findByRole("button", { name: "Edit summary" }));
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

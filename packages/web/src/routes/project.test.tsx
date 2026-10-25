import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { revisionView } from "@/project/revision-fixture";
import {
  downloadItem,
  emptyAnswer,
  jsonAnswer,
  openProjectTab,
  problemAnswer,
  renderRouted,
  testDeps,
  testOrigin,
} from "@/test-app";
import { ProjectRoute } from "./project.js";
import {
  body,
  deps,
  finished,
  output,
  recoveryAccepted,
  selectProjectStage,
  stage,
} from "./project-fixtures.js";
import { revisionRouteFixture } from "./project-revision.fake.js";

afterEach(cleanup);

// Cancel the run sits in the title row's "More" menu, behind its confirmation.
async function pressCancelRun(): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: "More" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Cancel the run…" }));
}

// The title row, where the project's next action is the one primary button.
const nextAction = () => {
  const row = screen.getByRole("heading", { level: 1 }).closest("header");
  if (row === null) throw new Error("The project has no title row.");
  return row;
};
const statusList = () => screen.findByRole("navigation", { name: "Project sections" });

describe("the project workspace", () => {
  it("shows a skeleton in the final shape while the project is coming", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, testDeps({}));
    expect(await screen.findByRole("status", { name: "Loading project" })).not.toBeNull();
  });

  it("names the problem when the project cannot be read", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": problemAnswer("No project has that id.", 404) }),
    );
    expect(await screen.findByText(/No project has that id\./)).not.toBeNull();
  });

  it("lists what the project makes, each with its state word and one detail, then All files", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const rail = await statusList();
    // Each output's state is a word beside its lamp, and a finished one says what it holds;
    // no row for Cost, Progress, Settings or Versions on a finished project.
    expect(
      within(rail)
        .getAllByRole("link")
        .map((item) => item.textContent),
    ).toEqual([
      "Article, Done · with sources and glossary",
      "Narration, Done · 01:00 · with intro and outro",
      "Images, Done · 2 images + 1 thumbnail",
      "Video, Done · 01:12 · 16:9",
      "All files, 9 files",
    ]);
    const video = within(rail).getByRole("link", { name: /^Video/ });
    expect(video.querySelector("[data-tone]")).not.toBeNull();
    // A section is an address: it opens in a new tab and survives a reload.
    expect(video.getAttribute("href")).toBe("/projects/p1?section=video");
    expect(video.getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByRole("status").map((live) => live.textContent)).toContain(
      "Project: Done",
    );
    // Nothing in the status column is a raised card or a disabled control.
    expect(document.querySelector(".sl-next")).toBeNull();
  });

  it("gives Shorts and YouTube their own sections, each opened by its address", async () => {
    const youtube = {
      ...finished,
      project: {
        ...finished.project,
        config: {
          ...finished.project.config,
          youtubeDescription: true,
          shorts: { enabled: true, count: 2, minSeconds: 20, maxSeconds: 40 },
        },
      },
      outputs: [
        ...finished.outputs,
        output("youtube_description", "video"),
        output("short_video", "video", { meta: { short: 1 } }),
      ],
    };
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(youtube) }),
    );
    const rail = await statusList();
    expect(
      within(rail)
        .getAllByRole("link")
        .map((item) => item.querySelector(".truncate")?.textContent),
    ).toEqual(["Article", "Narration", "Images", "Video", "Shorts", "YouTube", "All files"]);
    expect(within(rail).getByRole("link", { name: /^Shorts/ }).textContent).toBe(
      "Shorts, Done · 1 short",
    );
    await userEvent.click(within(rail).getByRole("link", { name: /^YouTube/ }));
    const text = await screen.findByRole("region", { name: "YouTube" });
    expect(text.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('section[aria-label="Video"]')?.hidden).toBe(true);
  });

  it("sums up the run's cost in one line under the list and opens the breakdown from it", async () => {
    const line = {
      calls: 3,
      cost: 1.25,
      unpriced: 0,
      apiEquivalent: null,
      apiUnpriced: 0,
      tokensIn: 0,
      tokensOut: 0,
      cachedTokens: 0,
      characters: 0,
      images: 0,
      seconds: 0,
    };
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1/run-cost": jsonAnswer({
          ...line,
          currency: "USD",
          totals: { ...line, wallMs: 90_000 },
          byStage: [{ ...line, stage: "article", wallMs: 90_000 }],
          run: { current: true, running: false, workingMs: 90_000 },
          byModel: [],
          plans: [],
          waits: [],
          catalogueDate: null,
        }),
      }),
    );
    const cost = (await screen.findByText(/^Cost \$1\.25/)).closest("p");
    expect(cost?.textContent).toBe("Cost $1.25 · 1 min 30 s of working time · See the breakdown");
    await userEvent.click(screen.getByRole("link", { name: "See the breakdown" }));
    expect(await screen.findByRole("region", { name: "Run cost summary" })).not.toBeNull();
    // The breakdown is on screen: the line no longer offers it.
    expect(screen.queryByRole("link", { name: "See the breakdown" })).toBeNull();
  });

  it("adds the PDF section once the run makes one", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(
          body({
            status: "done",
            stages: [
              ...finished.stages.filter((one) => one.kind !== "document"),
              stage("document", "done"),
            ],
            outputs: [...finished.outputs, output("document_pdf", "document")],
          }),
        ),
      }),
    );
    const pdf = await selectProjectStage("Document");
    expect(within(pdf).getByText(/DiceMaster theme/)).not.toBeNull();
    expect(within(pdf).getByRole("link", { name: "Download PDF" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/document-pdf`,
    );
  });

  it("carries a back link to the projects list", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const back = await screen.findByRole("link", { name: "Projects" });
    expect(back.getAttribute("href")).toBe("/projects");
  });
});

describe("the next action", () => {
  it("opens a finished project on its video, with Download video the one action", async () => {
    // A video made for YouTube: it writes the YouTube description.
    const youtube = {
      ...finished,
      project: {
        ...finished.project,
        config: { ...finished.project.config, youtubeDescription: true },
      },
    };
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(youtube),
        "GET /files/p1/article-md": () =>
          new Response(`# The Pharaoh\n\n${"A long finished article. ".repeat(500)}`),
      }),
    );
    const video = await screen.findByRole("region", { name: "Video" });
    expect(within(video).getByLabelText("Generated video")).not.toBeNull();
    expect(await downloadItem("Video (.mp4)")).not.toBeNull();
    expect(
      within(nextAction()).getByRole("link", { name: "Download video" }).getAttribute("href"),
    ).toBe(`${testOrigin}/files/p1/video`);
    // Copy for YouTube Studio sits beside the video, in its section's head.
    expect(within(video).getByRole("button", { name: "Copy for YouTube Studio" })).not.toBeNull();
    // The project's next step is the page's one lime button: the section's downloads are
    // secondary, and the YouTube text is a section of its own, not more of the Video section.
    const shown = [...document.querySelectorAll(".sl-btn--primary")].filter(
      (button) => button.closest("[hidden]") === null,
    );
    expect(shown.map((button) => button.textContent?.trim())).toEqual(["Download video"]);
    const article = await selectProjectStage("Article");
    expect(await within(article).findByText(/A long finished article/)).not.toBeNull();
  });

  it("offers no Copy for YouTube Studio for a video that is not made for YouTube", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const video = await screen.findByRole("region", { name: "Video" });
    expect(within(video).getByLabelText("Generated video")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Copy for YouTube Studio" })).toBeNull();
  });

  it("offers Pause while the run is at work, and Progress and each output's state", async () => {
    const paused = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(
          body({
            status: "running",
            stages: [
              stage("research", "skipped"),
              stage("article", "done"),
              stage("audio", "running"),
              stage("images", "pending"),
              stage("thumbnail", "pending"),
              stage("video", "pending"),
            ],
            outputs: [output("article_md", "article")],
          }),
        ),
        "POST /api/projects/p1/pause": (request) => {
          paused();
          return jsonAnswer(recoveryAccepted)(request);
        },
      }),
    );
    await screen.findByRole("region", { name: "Narration" });
    const rail = await statusList();
    // Progress leads the list while the run goes; a row at work says what it does under it.
    expect(within(rail).getByRole("link", { name: /^Progress/ }).textContent).toBe(
      // Counted as the title row counts it: the step the run is at.
      "Progress, Running · Step 2 of 4",
    );
    const narration = within(rail).getByRole("link", { name: /^Narration/ });
    expect(narration.textContent).toBe("Narration, Running");
    expect(narration.nextElementSibling?.textContent).toBe("chunk 1 of 4 · time left unknown");
    expect(within(rail).queryByText(/^Research/)).toBeNull();
    await userEvent.click(within(nextAction()).getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(paused).toHaveBeenCalledTimes(1));
  });
});

describe("time left on a running step", () => {
  it("goes by past runs for a CLI image job that has counted nothing yet, and says unknown otherwise", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(
          body({
            status: "running",
            stages: [
              stage("article", "done"),
              stage("audio", "running", {
                startedAt: new Date().toISOString(),
                progressCurrent: null,
                progressTotal: null,
              }),
              stage("thumbnail", "running", {
                source: "from_prompt",
                startedAt: new Date(Date.now() - 60_000).toISOString(),
                progressCurrent: 0,
                progressTotal: 1,
                typicalSeconds: 300,
              }),
            ],
            outputs: [output("article_md", "article")],
          }),
        ),
      }),
    );
    const rail = await statusList();
    const line = (name: string) =>
      within(rail).getByRole("link", { name: new RegExp(`^${name}`) }).nextElementSibling
        ?.textContent;
    await waitFor(() => expect(line("Images")).toMatch(/about 4 min left$/));
    expect(line("Narration")).toMatch(/time left unknown$/);
  });
});

describe("a failed stage", () => {
  const verbatim = "fal.ai: 429 Too Many Requests after 4 attempts (2s, 8s, 30s, Retry-After 45s)";
  const failed = body({
    status: "failed",
    stages: [
      stage("research", "skipped"),
      stage("article", "done"),
      stage("audio", "done"),
      stage("images", "failed", { failureReason: verbatim, attemptCount: 4 }),
      stage("thumbnail", "done"),
      stage("video", "pending"),
    ],
    outputs: [output("article_md", "article")],
  });

  it("opens on the failed step and shows the provider's own words beside it", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(failed) }),
    );
    const images = await screen.findByRole("region", { name: "Images" });
    const beside = within(images).getByRole("alert");
    expect(within(beside).getByText("Images stopped with an error.")).not.toBeNull();
    await userEvent.click(within(beside).getByText("Error details"));
    // Verbatim: the whole sentence is one text node, neither truncated nor rewritten.
    expect(within(beside).getByText(verbatim).textContent).toBe(verbatim);
    expect(within(beside).getByRole("button", { name: "Try images again" })).not.toBeNull();
    expect(within(nextAction()).getByRole("button", { name: "Try images again" })).not.toBeNull();
  });

  it("retries the failed stage without a dialog, because a retry destroys nothing", async () => {
    const retried = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(failed),
        "POST /api/projects/p1/stages/images/retry": (request) => {
          retried();
          return jsonAnswer(recoveryAccepted)(request);
        },
      }),
    );
    await screen.findByRole("region", { name: "Images" });
    await userEvent.click(within(nextAction()).getByRole("button", { name: "Try images again" }));
    await waitFor(() => {
      expect(retried).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends a rejected key to the provider settings instead of a retry", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(
          body({
            ...failed,
            status: "failed",
            stages: failed.stages.map((one) =>
              one.kind === "images"
                ? { ...one, failureKind: "missing_key", failureReason: "No key saved." }
                : one,
            ),
            outputs: failed.outputs,
          }),
        ),
      }),
    );
    await screen.findByRole("region", { name: "Images" });
    const link = await within(nextAction()).findByRole("link", {
      name: "Open Settings → Keys & services → fal.ai",
    });
    expect(link.getAttribute("href")).toBe("/settings?section=providers");
  });
});

describe("cancelling a run", () => {
  const running = body({
    status: "running",
    stages: [
      stage("research", "skipped"),
      stage("article", "done"),
      stage("audio", "running"),
      stage("images", "pending"),
      stage("thumbnail", "pending"),
      stage("video", "pending"),
    ],
    outputs: [output("article_md", "article")],
  });

  it("asks with the design's own copy before it stops anything", async () => {
    const canceled = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(running),
        "POST /api/projects/p1/revisions/prepare": jsonAnswer({
          ok: true,
          view: revisionView(),
          created: true,
        }),
        "POST /api/projects/p1/cancel": (request) => {
          canceled();
          return jsonAnswer(running)(request);
        },
      }),
    );

    await pressCancelRun();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Cancel this run?")).not.toBeNull();
    expect(
      within(dialog).getByText("Stops every running stage; finished outputs are kept."),
    ).not.toBeNull();
    expect(within(dialog).getByRole("button", { name: "Keep running" })).not.toBeNull();
    // Nothing has been stopped by opening the dialog.
    expect(canceled).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel run" }));
    await waitFor(() => {
      expect(canceled).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the run when the dialog is dismissed, and closes on Escape", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(running) }),
    );

    await pressCancelRun();
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep running" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    await pressCancelRun();
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("offers no Cancel once the run is over, and Delete in its place", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await statusList();
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: "Delete project…" })).not.toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Cancel the run…" })).toBeNull();
  });

  it("keeps article output read-only and offers the settings while a stage runs", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(running) }),
    );
    await selectProjectStage("Article");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    await openProjectTab("Edit");
    expect(await screen.findByRole("form", { name: "Edit settings" })).not.toBeNull();
  });
});

describe("the stage bodies", () => {
  it("plays the three narration segments and offers each for download", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const workspace = await selectProjectStage("Audio");

    const players = [...workspace.querySelectorAll("audio")];
    expect(players.map((player) => player.getAttribute("src"))).toEqual([
      `${testOrigin}/files/p1/audio-intro`,
      `${testOrigin}/files/p1/audio-body`,
      `${testOrigin}/files/p1/audio-outro`,
    ]);
    // A narration in parts names each part, in plain words.
    expect(screen.getByLabelText("Main part narration")).not.toBeNull();
    // One line of facts in plain words; how it was sent to the voice is a technical detail.
    expect(
      await within(workspace).findByText("Voice Narrator M · 1 min 12 s", { exact: false }),
    ).not.toBeNull();
    expect(within(workspace).queryByText("Chunking")).toBeNull();
    await userEvent.click(within(workspace).getByText("Technical details"));
    expect(within(workspace).getByText("Sent to the voice every 500 words.")).not.toBeNull();
  });

  it("draws the image grid from the run's own prompt groups, opening each full size", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const images = await selectProjectStage("Images");
    const group = within(images).getByRole("region", { name: "Oil painting scenes × 2" });
    // One grid: the thumbnail leads, then the images at the same size.
    const tiles = [...group.querySelectorAll("figure img")];
    expect(tiles.map((tile) => tile.getAttribute("src"))).toEqual([
      `${testOrigin}/files/p1/thumbnail`,
      `${testOrigin}/files/p1/image-1`,
      `${testOrigin}/files/p1/image-2`,
    ]);
    // Every file current: Download all is a download, named with what the zip holds.
    expect(
      within(images)
        .getByRole("link", { name: "Download both images (.zip)" })
        .getAttribute("href"),
    ).toBe(`${testOrigin}/files/p1/images.zip`);
    await userEvent.click(within(group).getByRole("button", { name: "Open image 2 full size" }));
    const lightbox = await screen.findByRole("dialog");
    expect(within(lightbox).getByText(/^3 of 3/)).not.toBeNull();
  });

  it("plays the video in a real player and offers the mp4", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByRole("region", { name: "Video" });
    const player = container.querySelector(".sl-player video");
    expect(player?.getAttribute("src")).toBe(`${testOrigin}/files/p1/video`);
    // Slopify's own controls, not the browser's.
    expect(player?.hasAttribute("controls")).toBe(false);
    expect(screen.getByRole("slider", { name: "Seek" })).not.toBeNull();
    const download = await downloadItem("Video (.mp4)");
    expect(download.getAttribute("href")).toBe(`${testOrigin}/files/p1/video`);
    expect(download.hasAttribute("download")).toBe(true);
  });

  it("renders the article and offers its end matter in its Download menu", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await selectProjectStage("Article");
    expect(await screen.findByText("Most villains want something.")).not.toBeNull();
    expect(screen.getByText("The Pharaoh")).not.toBeNull();
    // The end matter is in the article's one Download menu.
    expect((await downloadItem("Sources (.bin)")).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/sources`,
    );
    expect((await downloadItem("Pronunciation glossary (.bin)")).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/glossary`,
    );
  });

  it("leads the images with the thumbnail, badged, without its prompt", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const images = await selectProjectStage("Images");
    const thumbnail = within(images)
      .getByRole("img", { name: "Thumbnail for Rope Tricks" })
      .closest("figure");
    if (thumbnail === null) throw new Error("The thumbnail is not a tile.");
    expect(within(thumbnail).getByText("Thumbnail")).not.toBeNull();
    expect(
      within(thumbnail).getByRole("button", { name: "Make the thumbnail again" }),
    ).not.toBeNull();
    expect(
      within(thumbnail).getByRole("link", { name: "Download the thumbnail" }).getAttribute("href"),
    ).toBe(`${testOrigin}/files/p1/thumbnail`);
    expect(screen.queryByText("A cracked skull with gemstone eyes")).toBeNull();
    const pictures = [...images.querySelectorAll("figure img")];
    expect(pictures[0]?.getAttribute("alt")).toBe("Thumbnail for Rope Tricks");
  });

  it("opens on Article for a research failure, with the Research tab open", async () => {
    const retried = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(
          body({
            status: "failed",
            stages: [
              stage("research", "failed", { failureReason: "openrouter: 401", attemptCount: 1 }),
              stage("article", "pending"),
              stage("audio", "pending"),
              stage("images", "pending"),
              stage("thumbnail", "skipped"),
              stage("video", "pending"),
            ],
            outputs: [],
          }),
        ),
        "POST /api/projects/p1/stages/research/retry": (request) => {
          retried();
          return jsonAnswer(recoveryAccepted)(request);
        },
      }),
    );
    const article = await screen.findByRole("region", { name: "Article" });
    expect(within(article).getByText("Research stopped with an error.")).not.toBeNull();
    expect(
      within(article).getByRole("tab", { name: "Research" }).getAttribute("aria-selected"),
    ).toBe("true");
    await userEvent.click(
      within(nextAction()).getByRole("button", { name: "Try the research again" }),
    );
    await waitFor(() => expect(retried).toHaveBeenCalledTimes(1));
  });

  it("keeps the thumbnail in Images when the slideshow is switched off", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(
          body({
            status: "done",
            stages: [
              ...finished.stages.filter((one) => one.kind !== "images"),
              stage("images", "skipped"),
            ],
            outputs: finished.outputs.filter((one) => one.stageKind !== "images"),
          }),
        ),
      }),
    );
    const section = await selectProjectStage("Thumbnail");
    expect(within(section).getByRole("img", { name: "Thumbnail for Rope Tricks" })).not.toBeNull();
    expect(within(section).queryByRole("region", { name: "Slideshow images" })).toBeNull();
    expect(within(section).queryByText(/switched off/)).toBeNull();
  });

  it("says a failed thumbnail on Images, with its retry as the next action", async () => {
    const retried = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(
          body({
            status: "failed",
            stages: [
              ...finished.stages.filter((one) => one.kind !== "thumbnail"),
              stage("thumbnail", "failed", { failureReason: "fal.ai: 500", attemptCount: 2 }),
            ],
            outputs: finished.outputs.filter((one) => one.stageKind !== "thumbnail"),
          }),
        ),
        "POST /api/projects/p1/stages/thumbnail/retry": (request) => {
          retried();
          return jsonAnswer(recoveryAccepted)(request);
        },
      }),
    );
    const images = await screen.findByRole("region", { name: "Images" });
    expect(within(images).getByText("Thumbnail stopped with an error.")).not.toBeNull();
    expect(within(images).getByText("Not made")).not.toBeNull();
    await userEvent.click(
      within(nextAction()).getByRole("button", { name: "Try the thumbnail again" }),
    );
    await waitFor(() => expect(retried).toHaveBeenCalledTimes(1));
  });

  it("keeps pending export actions unavailable while showing the existing file", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(
          body({
            status: "running",
            stages: [stage("video", "pending")],
            outputs: [output("video", "video")],
          }),
        ),
      }),
    );
    await screen.findByRole("region", { name: "Video" });
    expect(screen.queryByRole("button", { name: "Render the video again" })).toBeNull();
    expect(screen.getByLabelText("Generated video")).not.toBeNull();
    expect(screen.queryByLabelText("Captions", { selector: "select" })).toBeNull();
  });
});

describe("Progress", () => {
  const going = body({
    status: "running",
    stages: [
      stage("research", "skipped"),
      stage("article", "done"),
      stage("audio", "done"),
      stage("images", "done"),
      stage("thumbnail", "done"),
      stage("video", "running", {
        progressCurrent: 45,
        progressTotal: 100,
        activity: { label: "rendering the video", percent: 45 },
      }),
    ],
    outputs: [output("article_md", "article"), ...finished.outputs.slice(3, 9)],
  });

  it("shows the whole run's progress, its steps and the video rendering while the run goes", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(going) }),
    );
    const rail = await statusList();
    await userEvent.click(within(rail).getByRole("link", { name: /^Progress/ }));
    const progress = await screen.findByRole("region", { name: "Progress" });
    expect(within(progress).getByText(/^Making your video · Step 4 of 4/)).not.toBeNull();
    expect(within(progress).getByRole("progressbar", { name: "Whole run" })).not.toBeNull();
    const steps = within(progress).getByRole("list", { name: "Run steps" });
    expect(within(steps).getByText("Video")).not.toBeNull();
    const video = within(progress).getByRole("region", { name: "Video" });
    expect(within(video).getByRole("progressbar", { name: "Video" })).not.toBeNull();
    expect(within(video).getAllByText("Rendering the video (45%)").length).toBeGreaterThan(0);
    // A finished step says so, never that it is still to come.
    const article = within(progress).getByRole("region", { name: "Article" });
    expect(article.textContent).toContain("Written.");
    expect(article.textContent).not.toContain("appears here as it is written");
  });

  it("is not offered once the run is over, and its old address opens the video", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const rail = await statusList();
    expect(within(rail).queryByRole("link", { name: /^Progress/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Progress" })).toBeNull();
    expect(
      within(rail)
        .getByRole("link", { name: /^Video/ })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});

describe("the title row's More", () => {
  it("renames from the settings' title, and deletes after asking, with Undo", async () => {
    const removed = vi.fn();
    const fixture = revisionRouteFixture(finished);
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fixture.routes,
        "DELETE /api/projects/p1": (request) => {
          removed();
          return emptyAnswer()(request);
        },
      }),
    );
    await statusList();
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "Rename…",
      "Save as template…",
      "Posters & pictures…",
      "Delete project…",
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
    const title = await screen.findByLabelText("Project title");
    await waitFor(() => expect(document.activeElement).toBe(title));
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete project…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Delete "Rope Tricks"?')).not.toBeNull();
    expect(removed).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete project" }));
    await waitFor(() => expect(removed).toHaveBeenCalledOnce());
    // ceiling: opens the settings and two menus; alone 1.9 s, past 5 s under a loaded suite.
  }, 20_000);

  it("marks a finished video uploaded from More, with Undo, and says so in the title row", async () => {
    const marked: unknown[] = [];
    let uploadedAt: string | null = null;
    const youtube = {
      ...finished,
      project: {
        ...finished.project,
        config: { ...finished.project.config, youtubeDescription: true },
      },
    };
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(youtube),
        "GET /api/projects": () =>
          jsonAnswer({
            projects: [
              {
                ...youtube.project,
                progress: 1,
                channelId: "00000000-0000-4000-8000-000000000001",
                uploadedAt,
              },
            ],
          })(new Request("http://test")),
        "PUT /api/projects/p1/uploaded": async (request) => {
          const body = (await request.json()) as { uploaded: boolean };
          marked.push(body);
          uploadedAt = body.uploaded ? "2026-09-28T09:00:00.000Z" : null;
          return jsonAnswer({ uploadedAt })(request);
        },
      }),
    );
    await statusList();
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Mark uploaded" }));
    await waitFor(() => expect(marked).toEqual([{ uploaded: true }]), { timeout: 5_000 });
    expect(await screen.findByText(/^uploaded /, {}, { timeout: 5_000 })).not.toBeNull();
    // ceiling: the list's row arrives before More offers Mark uploaded; under a loaded suite
    // that has taken over 2 s.
  }, 20_000);
});

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { revisionView } from "@/project/revision-fixture";
import {
  downloadItem,
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

afterEach(cleanup);

// Cancel the run sits in the title row's "More" menu, behind its confirmation.
async function pressCancelRun(): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: "More project actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Cancel the run…" }));
}

const nextAction = () => screen.getByRole("region", { name: "Next action" });

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

  it("lists the sections in the rail, each stage with its lamp, then the views", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const rail = await screen.findByRole("navigation", { name: "Project sections" });
    expect(
      within(rail)
        .getAllByRole("button")
        .map((item) => item.textContent),
    ).toEqual(["Article", "Narration", "Images", "Video", "Cost", "Live", "Settings", "History"]);
    expect(
      within(rail).getByRole("button", { name: "Video" }).querySelector("[data-tone]"),
    ).not.toBeNull();
    expect(screen.getAllByRole("status").map((live) => live.textContent)).toContain(
      "Project: Done",
    );
  });

  it("sums up a finished run's cost at the top and opens the Cost section from it", async () => {
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
          byModel: [],
          plans: [],
          waits: [],
          catalogueDate: null,
        }),
      }),
    );
    const summary = await screen.findByRole("region", { name: "Run cost" });
    expect(summary.textContent).toContain("This run cost $1.25 · 1 min 30 s end to end");
    await userEvent.click(within(summary).getByRole("button", { name: "See cost by stage" }));
    expect(await screen.findByRole("region", { name: "Run cost summary" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "See cost by stage" })).toBeNull();
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
    expect(within(pdf).getByText("PDF · DiceMaster theme")).not.toBeNull();
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
  it("opens a finished project on its video, with Prepare upload the one action", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /files/p1/article-md": () =>
          new Response(`# The Archlich\n\n${"A long finished article. ".repeat(500)}`),
      }),
    );
    const video = await screen.findByRole("region", { name: "Video" });
    expect(within(video).getByLabelText("Generated video")).not.toBeNull();
    expect(await downloadItem("Video (.mp4)")).not.toBeNull();
    expect(within(nextAction()).getByRole("button", { name: "Prepare upload" })).not.toBeNull();
    // One primary action on the page.
    const shown = [...document.querySelectorAll(".sl-btn--primary")].filter(
      (button) => button.closest("[hidden]") === null,
    );
    expect(shown).toHaveLength(1);
    const article = await selectProjectStage("Article");
    expect(await within(article).findByText(/A long finished article/)).not.toBeNull();
  });

  it("offers Pause while the run is at work, and the steps with their state", async () => {
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
    expect(within(nextAction()).getByText("Making the narration · 1 of 4.")).not.toBeNull();
    const steps = screen.getByRole("list", { name: "Run steps" });
    expect(within(steps).getByText("Narration").textContent).toBe("Narration, Running");
    expect(within(steps).queryByText(/^Research/)).toBeNull();
    await userEvent.click(within(nextAction()).getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(paused).toHaveBeenCalledTimes(1));
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
    await screen.findByRole("region", { name: "Next action" });
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
    const link = await within(
      await screen.findByRole("region", { name: "Next action" }),
    ).findByRole("link", { name: "Open Settings → Providers → fal.ai" });
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

  it("offers no Cancel once the run is over", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByRole("navigation", { name: "Project sections" });
    await userEvent.click(screen.getByRole("button", { name: "More project actions" }));
    expect(
      (await screen.findByRole("menuitem", { name: "Cancel the run…" })).getAttribute(
        "aria-disabled",
      ),
    ).toBe("true");
  });

  it("keeps article output read-only and offers the settings while a stage runs", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(running) }),
    );
    await selectProjectStage("Article");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    await openProjectTab("Edit");
    expect(await screen.findByRole("form", { name: "Edit project" })).not.toBeNull();
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
    expect(screen.getByLabelText("Body narration")).not.toBeNull();
    expect(await within(workspace).findByText("Narrator M")).not.toBeNull();
    expect(screen.getByText("Chunking: every 500 words")).not.toBeNull();
  });

  it("draws the image grid from the run's own prompt groups, opening each full size", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const images = await selectProjectStage("Images");
    const slideshow = within(images).getByRole("region", { name: "Slideshow images" });
    expect(
      within(slideshow).getByRole("region", { name: "Oil painting scenes × 2" }),
    ).not.toBeNull();
    const tiles = [...slideshow.querySelectorAll("figure img")];
    expect(tiles.map((tile) => tile.getAttribute("src"))).toEqual([
      `${testOrigin}/files/p1/image-1`,
      `${testOrigin}/files/p1/image-2`,
    ]);
    expect(within(slideshow).getByRole("link", { name: "Download all" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/images.zip`,
    );
    await userEvent.click(
      within(slideshow).getByRole("button", { name: "Open image 2 full size" }),
    );
    const lightbox = await screen.findByRole("dialog");
    expect(within(lightbox).getByText(/^2 of 2/)).not.toBeNull();
  });

  it("plays the video in a real player and offers the mp4", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByRole("region", { name: "Video" });
    const player = container.querySelector(".sl-player video");
    expect(player?.getAttribute("src")).toBe(`${testOrigin}/files/p1/video`);
    expect(player?.hasAttribute("controls")).toBe(true);
    const download = await downloadItem("Video (.mp4)");
    expect(download.getAttribute("href")).toBe(`${testOrigin}/files/p1/video`);
    expect(download.hasAttribute("download")).toBe(true);
  });

  it("renders the article and links its end matter beside the title", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await selectProjectStage("Article");
    expect(await screen.findByText("Most villains want something.")).not.toBeNull();
    expect(screen.getByText("The Archlich")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Sources" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/sources`,
    );
    expect(screen.getByRole("link", { name: "Glossary" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/glossary`,
    );
  });

  it("shows the thumbnail above the slideshow images, without its prompt", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const images = await selectProjectStage("Images");
    const thumbnail = within(images).getByRole("region", { name: "Thumbnail" });
    expect(
      within(thumbnail).getByRole("img", { name: "Thumbnail for Rope Tricks" }),
    ).not.toBeNull();
    expect(
      within(thumbnail).getByRole("button", { name: "Regenerate the thumbnail" }),
    ).not.toBeNull();
    expect(
      within(thumbnail).getByRole("link", { name: "Download the thumbnail" }).getAttribute("href"),
    ).toBe(`${testOrigin}/files/p1/thumbnail`);
    expect(screen.queryByText("A cracked skull with gemstone eyes")).toBeNull();
    const regions = within(images)
      .getAllByRole("region")
      .map((one) => one.getAttribute("aria-label"));
    expect(regions.indexOf("Thumbnail")).toBeLessThan(regions.indexOf("Slideshow images"));
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
    expect(screen.queryByRole("button", { name: "More actions for Video" })).toBeNull();
    expect(screen.getByLabelText("Generated video")).not.toBeNull();
    expect(screen.queryByLabelText("Subtitles", { selector: "select" })).toBeNull();
  });
});

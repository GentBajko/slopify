import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { revisionView } from "@/project/revision-fixture";
import {
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
  ready,
  recoveryAccepted,
  selectProjectStage,
  stage,
} from "./project-fixtures.js";

afterEach(cleanup);

// Cancel run sits in the page bar's "More" menu, behind its confirmation.
async function pressCancelRun(): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: "More project actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Cancel run" }));
}

describe("the project rundown", () => {
  it("shows a skeleton in the final shape while the project is coming", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, testDeps({}));
    await waitFor(() => {
      expect(container.querySelectorAll(".rounded-full").length).toBe(7);
    });
  });

  it("names the problem when the project cannot be read", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": problemAnswer("No project has that id.", 404) }),
    );
    expect(await screen.findByText("No project has that id.")).not.toBeNull();
  });

  it("gives every stage a lamp, a state word and a live announcement", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Research");
    const announced = screen.getAllByRole("status").map((live) => live.textContent);
    expect(announced).toContain("Video: done");
    expect(announced).toContain("Research: skipped");
    expect(announced).toContain("Document: skipped");
  });

  it("shows the Document row switched off, and its PDF once rendered", async () => {
    const off = renderRouted(<ProjectRoute projectId="p1" />, deps());
    const skipped = await selectProjectStage("Document");
    expect(within(skipped).getByText("Document was switched off for this run.")).not.toBeNull();
    off.unmount();

    const rendered = body({
      status: "done",
      stages: [
        ...finished.stages.filter((one) => one.kind !== "document"),
        stage("document", "done"),
      ],
      outputs: [...finished.outputs, output("document_pdf", "document")],
    });
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(rendered) }),
    );
    const navigation = await screen.findByRole("navigation", { name: "Project stages" });
    expect(within(navigation).getByRole("button", { name: "Document, done" })).not.toBeNull();
    expect(within(navigation).getByText("PDF · DiceMaster theme")).not.toBeNull();
    const workspace = await selectProjectStage("Document");
    expect(within(workspace).getByRole("link", { name: "Download PDF" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/document-pdf`,
    );
  });

  it("carries a back link to the projects list", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const back = await screen.findByText("< Projects");
    expect(back.getAttribute("href")).toBe("/");
  });
});

describe("the focused project workspace", () => {
  it("opens the final player and download before a long finished article", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /files/p1/article-md": () =>
          new Response(`# The Archlich\n\n${"A long finished article. ".repeat(500)}`),
      }),
    );
    const workspace = await screen.findByRole("region", { name: "Video workspace" });
    expect(within(workspace).getByLabelText("Generated video")).not.toBeNull();
    expect(within(workspace).getByRole("link", { name: "Download .mp4" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Download video" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Video, done" }).getAttribute("aria-current")).toBe(
      "step",
    );
    expect(screen.queryByRole("region", { name: "Article workspace" })).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Overall progress" }).getAttribute("aria-valuenow"),
    ).toBe("100");
    const article = await selectProjectStage("Article");
    expect(await within(article).findByText(/A long finished article/)).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Video workspace" })).toBeNull();
  });

  it("keeps overall progress visible while reviewing a different stage", async () => {
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
      }),
    );
    await screen.findByRole("region", { name: "Audio workspace" });
    expect(
      screen.getByRole("progressbar", { name: "Overall progress" }).getAttribute("aria-valuenow"),
    ).toBe("25");
    expect(
      screen.getByRole("progressbar", { name: "Overall progress" }).getAttribute("aria-valuetext"),
    ).toContain("1 of 5 stages finished");
    await selectProjectStage("Article");
    expect(
      screen.getByRole("progressbar", { name: "Overall progress" }).getAttribute("aria-valuenow"),
    ).toBe("25");
    expect(screen.getByRole("button", { name: "Pause" })).not.toBeNull();
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

  it("shows the provider's own words, unaltered, with the attempt count and a Retry", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(failed) }),
    );

    const workspace = await screen.findByRole("region", { name: "Images workspace" });
    await userEvent.click(within(workspace).getByText("Error details"));
    // The details open in a popover over the page, so the sentence is read from the page.
    const line = await screen.findByText(verbatim);
    // Verbatim: the whole sentence is one text node, neither truncated nor rewritten.
    expect(line.textContent).toBe(verbatim);
    expect(within(workspace).getByText("4 attempts")).not.toBeNull();
    expect(within(workspace).getByRole("button", { name: "Retry stage" })).not.toBeNull();
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

    await userEvent.click(await screen.findByRole("button", { name: "Retry stage" }));
    await waitFor(() => {
      expect(retried).toHaveBeenCalledTimes(1);
    });
  });

  it("disables Retry and names the missing key when the provider has none", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(failed),
        "GET /api/providers": jsonAnswer({
          providers: [{ ...ready[2], readiness: { kind: "keyed", hasKey: false } }],
        }),
      }),
    );

    const control = await screen.findByRole("button", { name: "Key Missing" });
    expect(control.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "Open Settings" })).not.toBeNull();
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
    await screen.findByText("Research");
    await userEvent.click(screen.getByRole("button", { name: "More project actions" }));
    expect(
      (await screen.findByRole("menuitem", { name: "Cancel run" })).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("keeps article output read-only and offers revision editing while a stage runs", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(running) }),
    );
    await selectProjectStage("Article");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    await openProjectTab("Edit");
    expect(screen.getByRole("button", { name: "Edit project" }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});

describe("the stage bodies", () => {
  it("plays the three narration segments and offers each for download", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    const workspace = await selectProjectStage("Audio");

    const players = [...workspace.querySelectorAll("audio")];
    expect(players.map((player) => player.getAttribute("src"))).toEqual([
      `${testOrigin}/files/p1/audio-intro`,
      `${testOrigin}/files/p1/audio-body`,
      `${testOrigin}/files/p1/audio-outro`,
    ]);
    expect(screen.getByLabelText("Body narration")).not.toBeNull();
    expect(
      await within(
        container.querySelector('[data-tour="project-audio"]') as HTMLElement,
      ).findByText("Narrator M"),
    ).not.toBeNull();
    expect(screen.getByText("Chunking: every 500 words")).not.toBeNull();
  });

  it("draws the image grid from the run's own prompt groups", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    await selectProjectStage("Images");

    expect(screen.getByText("Oil painting scenes × 2")).not.toBeNull();
    const tiles = [...container.querySelectorAll("figure img")];
    expect(tiles.map((tile) => tile.getAttribute("src"))).toEqual([
      `${testOrigin}/files/p1/image-1`,
      `${testOrigin}/files/p1/image-2`,
    ]);
    expect(screen.getByRole("link", { name: "Download all" }).getAttribute("href")).toBe(
      `${testOrigin}/files/p1/images.zip`,
    );
  });

  it("plays the video and offers the mp4", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Video");

    expect(container.querySelector("video")?.getAttribute("src")).toBe(
      `${testOrigin}/files/p1/video`,
    );
    const download = screen.getByRole("link", { name: "Download .mp4" });
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

  it("shows the thumbnail with the prompt that made it", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await selectProjectStage("Thumbnail");
    expect(screen.getByText("A cracked skull with gemstone eyes")).not.toBeNull();
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
    await screen.findByText("Video");
    expect(screen.queryByRole("button", { name: "Re-render" })).toBeNull();
    expect(screen.getByLabelText("Generated video")).not.toBeNull();
    expect(screen.queryByLabelText("Subtitles", { selector: "select" })).toBeNull();
  });
});

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted, testDeps, testOrigin } from "@/test-app";
import { ProjectRoute } from "./project.js";
import { body, deps, output, ready, stage } from "./project-fixtures.js";

afterEach(cleanup);

describe("the project rundown", () => {
  it("shows a skeleton in the final shape while the project is coming", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, testDeps({}));
    await waitFor(() => {
      expect(container.querySelectorAll(".rounded-full").length).toBe(6);
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
  });

  it("carries a back link to the projects list", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    const back = await screen.findByText("< Projects");
    expect(back.getAttribute("href")).toBe("/");
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

    const line = await screen.findByText(verbatim);
    // Verbatim: the whole sentence is one text node, neither truncated nor rewritten.
    expect(line.textContent).toBe(verbatim);
    const row = line.closest("div");
    expect(within(row as HTMLElement).getByText("4 attempts")).not.toBeNull();
    expect(within(row as HTMLElement).getByRole("button", { name: "Retry stage" })).not.toBeNull();
  });

  it("retries the failed stage without a dialog, because a retry destroys nothing", async () => {
    const retried = vi.fn();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(failed),
        "POST /api/projects/p1/stages/images/retry": (request) => {
          retried();
          return jsonAnswer({ ...failed, redone: ["images"] })(request);
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

    const control = await screen.findByRole("button", { name: "Key missing" });
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
        "POST /api/projects/p1/cancel": (request) => {
          canceled();
          return jsonAnswer(running)(request);
        },
      }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "Cancel run" }));
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

    await userEvent.click(await screen.findByRole("button", { name: "Cancel run" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep running" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cancel run" }));
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("offers no Cancel once the run is over", async () => {
    renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Research");
    expect(screen.queryByRole("button", { name: "Cancel run" })).toBeNull();
  });

  it("disables every edit and re-run while a stage is running", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ "GET /api/projects/p1": jsonAnswer(running) }),
    );
    const edit = await screen.findByRole("button", { name: "Edit" });
    expect(edit.hasAttribute("disabled")).toBe(true);
  });
});

describe("the stage bodies", () => {
  it("plays the three narration segments and offers each for download", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Audio");

    const players = [...container.querySelectorAll("audio")];
    expect(players.map((player) => player.getAttribute("src"))).toEqual([
      `${testOrigin}/files/p1/audio-intro`,
      `${testOrigin}/files/p1/audio-body`,
      `${testOrigin}/files/p1/audio-outro`,
    ]);
    expect(screen.getByLabelText("Body narration")).not.toBeNull();
    expect(await screen.findByText("Narrator M")).not.toBeNull();
    expect(screen.getByText("Chunking: every 500 words")).not.toBeNull();
  });

  it("draws the image grid from the run's own prompt groups", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, deps());
    await screen.findByText("Images");

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
    await screen.findByText("Thumbnail");
    expect(screen.getByText("A cracked skull with gemstone eyes")).not.toBeNull();
  });

  it("keeps a pending stage collapsed", async () => {
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
  });
});

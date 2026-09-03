import type { StageKind, StageState } from "@app/kernel/pipeline.js";
import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted, testDeps, testOrigin } from "@/test-app";
import { ProjectRoute } from "./project.js";

afterEach(cleanup);

function stage(kind: StageKind, state: StageState): Stage {
  return {
    id: `s-${kind}`,
    projectId: "p1",
    kind,
    source: state === "provided" ? "provide" : state === "skipped" ? "off" : "generate",
    state,
    failureReason: state === "failed" ? "ffmpeg: exit 1" : null,
    attemptCount: 0,
    progressCurrent: state === "running" ? 1 : null,
    progressTotal: state === "running" ? 4 : null,
    startedAt: null,
    finishedAt: null,
  };
}

function output(
  role: Output["role"],
  stageKind: StageKind,
  originalFilename: string | null,
): Output {
  return {
    id: `o-${role}`,
    projectId: "p1",
    stageKind,
    role,
    path: role,
    originalFilename,
    bytes: 12,
    durationMs: null,
    meta: {},
    createdAt: "2026-09-03T00:00:00.000Z",
  };
}

function body(options: {
  readonly status: "running" | "done";
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
}) {
  return {
    project: {
      id: "p1",
      title: "Rope Tricks",
      format: "16:9",
      status: options.status,
      config: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    stages: options.stages,
    outputs: options.outputs,
  };
}

const midRun = body({
  status: "running",
  stages: [
    stage("research", "skipped"),
    stage("article", "provided"),
    stage("audio", "provided"),
    stage("images", "provided"),
    stage("thumbnail", "skipped"),
    stage("video", "running"),
  ],
  outputs: [output("audio_body", "audio", "body.mp3")],
});

const finished = body({
  status: "done",
  stages: [
    stage("research", "skipped"),
    stage("article", "provided"),
    stage("audio", "provided"),
    stage("images", "provided"),
    stage("thumbnail", "skipped"),
    stage("video", "done"),
  ],
  outputs: [output("audio_body", "audio", "body.mp3"), output("video", "video", null)],
});

describe("the project rundown", () => {
  it("shows a skeleton in the final shape while the project is coming", async () => {
    const { container } = renderRouted(<ProjectRoute projectId="p1" />, testDeps({}));
    // Six rows with an unlit spot each: the shape the rundown will have.
    await waitFor(() => {
      expect(container.querySelectorAll(".rounded-full").length).toBe(6);
    });
  });

  it("names the problem when the project cannot be read", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      testDeps({ "GET /api/projects/p1": problemAnswer("No project has that id.", 404) }),
    );
    expect(await screen.findByText("No project has that id.")).not.toBeNull();
  });

  it("gives every stage a lamp, a state word and a live announcement", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      testDeps({ "GET /api/projects/p1": jsonAnswer(midRun) }),
    );

    await screen.findByText("Research");
    const announced = screen.getAllByRole("status").map((live) => live.textContent);
    expect(announced).toContain("Video: running");
    expect(announced).toContain("Audio: provided");
    expect(announced).toContain("Research: skipped");
    expect(screen.getAllByText("running").length).toBeGreaterThan(0);
  });

  it("shows a provided stage's original filename instead of a prompt", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      testDeps({ "GET /api/projects/p1": jsonAnswer(midRun) }),
    );
    expect(await screen.findByText("body.mp3")).not.toBeNull();
  });

  it("offers no video until the render has landed", async () => {
    const { container } = renderRouted(
      <ProjectRoute projectId="p1" />,
      testDeps({ "GET /api/projects/p1": jsonAnswer(midRun) }),
    );
    await screen.findByText("Research");
    expect(container.querySelector("video")).toBeNull();
  });

  it("plays and offers the mp4 once the video stage is done", async () => {
    const { container } = renderRouted(
      <ProjectRoute projectId="p1" />,
      testDeps({ "GET /api/projects/p1": jsonAnswer(finished) }),
    );

    await screen.findByText("Research");
    const player = container.querySelector("video");
    expect(player?.getAttribute("src")).toBe(`${testOrigin}/files/p1/video`);
    const download = screen.getByRole("link", { name: "Download .mp4" });
    expect(download.getAttribute("href")).toBe(`${testOrigin}/files/p1/video`);
    expect(download.hasAttribute("download")).toBe(true);
  });

  it("carries a back link to the projects list", async () => {
    renderRouted(
      <ProjectRoute projectId="p1" />,
      testDeps({ "GET /api/projects/p1": jsonAnswer(finished) }),
    );
    const back = await screen.findByText("< Projects");
    expect(back.getAttribute("href")).toBe("/");
  });
});

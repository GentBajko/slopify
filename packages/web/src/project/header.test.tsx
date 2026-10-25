import type { ProjectSummary } from "@app/slices/admission/model.js";
import { defaultVoicesSettings } from "@app/slices/voices/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, stage } from "@/routes/project-fixtures";
import { renderRouted, testDeps } from "@/test-app";
import { finishedAt, ProjectHeader, runLength } from "./header";
import { NextChapterOffer } from "./next-action-view";

afterEach(cleanup);

const plain = body({ status: "done", stages: [], outputs: [] }).project as ProjectSummary;
const chapter: ProjectSummary = {
  ...plain,
  config: {
    ...plain.config,
    voices: { ...defaultVoicesSettings("audiobook"), book: { title: "Sea Tales", chapter: 3 } },
  },
};
const ran = [
  stage("article", "done", {
    startedAt: "2026-09-27T17:15:00.000Z",
    finishedAt: "2026-09-27T17:16:00.000Z",
  }),
  stage("video", "done", {
    startedAt: "2026-09-27T17:16:00.000Z",
    finishedAt: "2026-09-27T17:18:00.000Z",
  }),
];

it("says a finished project's state, what it is, when it finished, how long it took and its channel", async () => {
  renderRouted(
    <ProjectHeader
      project={chapter}
      stages={ran}
      channel="Sea stories"
      uploadedAt="2026-09-28T09:00:00.000Z"
      editing={false}
      onEdit={() => {}}
      more={[]}
      progress={1}
    />,
    testDeps({}),
  );
  const meta = await screen.findByText(/^Sea Tales · Chapter 3$/);
  const line = meta.closest(".sl-project__meta");
  expect(line?.textContent).toMatch(
    /^DoneProject: Done· Audiobook· Sea Tales · Chapter 3· finished .+, 3 min· Sea stories· uploaded .+$/,
  );
  // The whole title is there on hover when the row cuts it short.
  expect(screen.getByTitle("Rope Tricks").textContent).toBe("Rope Tricks");
});

it("names a podcast as an episode, and a video by nothing more", async () => {
  const podcast: ProjectSummary = {
    ...plain,
    config: { ...plain.config, voices: defaultVoicesSettings("podcast") },
  };
  const header = (project: ProjectSummary) => (
    <ProjectHeader
      project={project}
      stages={ran}
      editing={false}
      onEdit={() => {}}
      more={[]}
      progress={1}
    />
  );
  const { unmount } = renderRouted(header(podcast), testDeps({}));
  expect(await screen.findByText("Podcast episode")).not.toBeNull();
  unmount();
  renderRouted(header(plain), testDeps({}));
  const line = (await screen.findByText(/^finished /)).closest(".sl-project__meta");
  expect(line?.textContent).toMatch(/^DoneProject: Done· finished /);
});

it("names the run's start until it finishes", async () => {
  renderRouted(
    <ProjectHeader
      project={{ ...plain, status: "running" }}
      stages={ran}
      editing={false}
      onEdit={() => {}}
      more={[]}
      progress={0.5}
    />,
    testDeps({}),
  );
  expect(await screen.findByText(/^started /)).not.toBeNull();
  expect(screen.queryByText(/^finished /)).toBeNull();
});

it("says where a running run stands, beside its clock, as Home does", async () => {
  renderRouted(
    <ProjectHeader
      project={{ ...plain, status: "running" }}
      stages={[stage("article", "done"), stage("audio", "running"), stage("video", "pending")]}
      editing={false}
      onEdit={() => {}}
      more={[]}
      progress={0.5}
      clock={<span>Working · 0:01:12</span>}
    />,
    testDeps({}),
  );
  const line = (await screen.findByText(/^Step 2 of 3 · Narration/)).closest(".sl-project__meta");
  expect(line?.textContent).toMatch(/· started .+· Step 2 of 3 · Narration.*Working · 0:01:12$/);
});

it("puts the next action first, then Edit settings, then a worded More", async () => {
  const user = userEvent.setup();
  const removed = vi.fn();
  renderRouted(
    <ProjectHeader
      project={plain}
      stages={ran}
      primary={<button type="button">Download video</button>}
      editing={false}
      onEdit={() => {}}
      more={[
        { id: "uploaded", label: "Mark uploaded", run: () => {} },
        { id: "delete", label: "Delete project…", run: removed, apart: true },
      ]}
      progress={1}
    />,
    testDeps({}),
  );
  const buttons = (await screen.findAllByRole("button")).map((button) => button.textContent);
  expect(buttons).toEqual(["Download video", "Edit settings", "More"]);
  await user.click(screen.getByRole("button", { name: "More" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete project…" }));
  expect(removed).toHaveBeenCalledOnce();
});

it("says a held or prepared project's state as Projects and the agent tools do", async () => {
  const header = (over: Partial<ProjectSummary>, progress: number) => (
    <ProjectHeader
      project={{ ...plain, ...over }}
      stages={[]}
      editing={false}
      onEdit={() => {}}
      more={[]}
      progress={progress}
    />
  );
  renderRouted(
    <>
      {header({ status: "pending" }, 0.5)}
      {header({ status: "pending", prepared: true }, 0.5)}
      {header({ status: "pending" }, 0)}
      {header({ status: "pending", waitingForAgent: true }, 0.5)}
    </>,
    testDeps({}),
  );
  expect(await screen.findByText("Waiting for your review")).not.toBeNull();
  expect(screen.getByText("Prepared")).not.toBeNull();
  expect(screen.getByText("Queued")).not.toBeNull();
  expect(screen.getByText("Waiting for the agent")).not.toBeNull();
});

it("reads when a run finished and how long it took from its steps", () => {
  expect(finishedAt(ran)).toBe("2026-09-27T17:18:00.000Z");
  expect(runLength(ran)).toBe("3 min");
  expect(runLength([])).toBeUndefined();
  expect(finishedAt([stage("article", "pending")])).toBeUndefined();
});

it("offers a finished audiobook's next chapter with one line saying what it opens", async () => {
  const user = userEvent.setup();
  const run = vi.fn();
  renderRouted(<NextChapterOffer nextChapter={{ run, pending: false }} primary />, testDeps({}));
  await user.click(await screen.findByRole("button", { name: "Make the next chapter" }));
  expect(run).toHaveBeenCalledOnce();
  expect(screen.getByText(/^Opens Create set up for the next chapter/)).not.toBeNull();
});

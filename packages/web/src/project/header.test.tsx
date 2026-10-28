import type { ProjectSummary } from "@app/slices/admission/model.js";
import { defaultVoicesSettings } from "@app/slices/voices/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { body, stage } from "@/routes/project-fixtures";
import { renderRouted, testDeps } from "@/test-app";
import { finishedAt, ProjectActions, ProjectHeader, runLength, runStart } from "./header";
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
    <ProjectHeader project={project} stages={ran} editing={false} onEdit={() => {}} progress={1} />
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
      progress={0.5}
      clock={<span>Working · 0:01:12</span>}
    />,
    testDeps({}),
  );
  const line = (await screen.findByText(/^Step 2 of 3 · Narration/)).closest(".sl-project__meta");
  // The clock says how long it has worked, so the start time gives way to it.
  expect(line?.textContent).toMatch(/^Running.*· Step 2 of 3 · Narration.*Working · 0:01:12$/);
  expect(line?.textContent).not.toContain("started");
});

it("puts the next action first, then Edit settings, named for what a press does", async () => {
  const header = (editing: boolean) => (
    <ProjectHeader
      project={plain}
      stages={ran}
      primary={<button type="button">Download video</button>}
      editing={editing}
      onEdit={() => {}}
      progress={1}
    />
  );
  const { unmount } = renderRouted(header(false), testDeps({}));
  const buttons = (await screen.findAllByRole("button")).map((button) => button.textContent);
  expect(buttons).toEqual(["Download video", "Edit settings"]);
  unmount();
  // Open, the same button closes the settings, and says so.
  renderRouted(header(true), testDeps({}));
  expect(await screen.findByRole("button", { name: "Close settings" })).not.toBeNull();
});

// The project's other actions are listed in words, not behind a menu named More: nothing
// needs a press to find out what it is. Deleting sits apart; one that cannot act says why.
it("lists the project's other actions in words, deleting apart", async () => {
  const user = userEvent.setup();
  const removed = vi.fn();
  renderRouted(
    <ProjectActions
      actions={[
        { id: "uploaded", label: "Mark uploaded", run: () => {} },
        {
          id: "rebuild",
          label: "Choose what to make again…",
          run: () => {},
          disabledReason: "Wait until the last change is saved",
        },
        { id: "delete", label: "Delete project…", run: removed, apart: true },
      ]}
    />,
    testDeps({}),
  );
  const group = await screen.findByRole("region", { name: "Project actions" });
  const lists = within(group).getAllByRole("list");
  expect(
    lists.map((list) =>
      within(list)
        .getAllByRole("button")
        .map((button) => button.firstChild?.textContent),
    ),
  ).toEqual([["Mark uploaded", "Choose what to make again…"], ["Delete project…"]]);
  expect(
    screen
      .getByRole("button", { name: "Choose what to make again…" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  await user.click(screen.getByRole("button", { name: "Delete project…" }));
  expect(removed).toHaveBeenCalledOnce();
});

it("says a held or prepared project's state as Projects and the agent tools do", async () => {
  const header = (over: Partial<ProjectSummary>, progress: number) => (
    <ProjectHeader
      project={{ ...plain, ...over }}
      stages={[]}
      editing={false}
      onEdit={() => {}}
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
  expect(screen.getByText("Waiting for its day")).not.toBeNull();
  expect(screen.getByText("Queued")).not.toBeNull();
  expect(screen.getByText("Waiting for the agent")).not.toBeNull();
});

// A remake of the video on a copy said "started" at the copy's creation, minutes before the
// remake began.
it("starts a run at the first step it makes, with the steps that ran just before it", () => {
  const remake = [
    stage("article", "done", {
      startedAt: "2026-09-27T17:15:00.000Z",
      finishedAt: "2026-09-27T17:16:00.000Z",
    }),
    stage("video", "running", { startedAt: "2026-09-28T09:00:00.000Z" }),
  ];
  expect(runStart(remake)).toBe("2026-09-28T09:00:00.000Z");
  // One run: the article finished seconds before the narration started.
  const first = [
    stage("article", "done", {
      startedAt: "2026-09-27T17:15:00.000Z",
      finishedAt: "2026-09-27T17:16:00.000Z",
    }),
    stage("audio", "running", { startedAt: "2026-09-27T17:16:02.000Z" }),
  ];
  expect(runStart(first)).toBe("2026-09-27T17:15:00.000Z");
  expect(runStart(ran)).toBeUndefined();
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

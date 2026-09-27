import type { ProjectState } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startOfWeek } from "@/home/api";
import { spentLabel } from "@/home/week";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { HomeRoute } from "./home.js";
import { body, output, stage } from "./project-fixtures.js";

afterEach(cleanup);

const channel = "00000000-0000-4000-8000-000000000001";
const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";

function listing(
  id: string,
  title: string,
  status: ProjectState,
  over: Partial<ProjectListing> = {},
): ProjectListing {
  const base = body({ status, stages: [], outputs: [] }).project as unknown as ProjectListing;
  return { ...base, id, title, status, progress: 0, channelId: channel, uploadedAt: null, ...over };
}

const checkpoints = (state: string) =>
  jsonAnswer({
    revisionId: "r1",
    checkpoints: [
      {
        projectId: "p-wait",
        revisionId: "r1",
        checkpointId: "video-gate",
        workId: "w1",
        stage: "video",
        state,
        fingerprint: "a".repeat(64),
        currentFingerprint: "a".repeat(64),
        createdAt: "2026-09-13T00:00:00.000Z",
        approvedAt: null,
        dependents: [],
        workKeys: [],
      },
    ],
  });

function deps(extra: Readonly<Record<string, Answer>> = {}) {
  const running = body({
    status: "running",
    stages: [
      stage("article", "done", {
        startedAt: "2026-09-27T10:00:00.000Z",
        finishedAt: "2026-09-27T10:07:00.000Z",
      }),
      stage("images", "running", { progressCurrent: 2, progressTotal: 8 }),
      stage("video", "pending"),
    ],
    outputs: [
      output("image", "images", { meta: { index: 1 } }),
      output("image", "images", { meta: { index: 2 } }),
    ],
  });
  const failed = body({
    status: "failed",
    stages: [
      stage("images", "failed", {
        failureReason: "Codex is signed out.",
        failureKind: "auth",
      }),
    ],
    outputs: [],
  });
  return testDeps({
    "GET /api/projects": jsonAnswer({
      projects: [
        listing("p-run", "Sargon", "running", { progress: 0.4 }),
        listing("p-wait", "Cleopatra", "pending", { progress: 0.6 }),
        listing("p-fail", "Imhotep", "failed", { progress: 0.3 }),
        listing("p-done", "Ashurbanipal", "done", { progress: 1 }),
        listing("p-up", "Hypatia", "done", { progress: 1, uploadedAt: "2026-09-26T10:00:00.000Z" }),
        listing("p-else", "Elsewhere", "running", { channelId: "other" }),
      ],
    }),
    "GET /api/projects/p-run": jsonAnswer({
      ...running,
      project: { ...running.project, id: "p-run" },
    }),
    "GET /api/projects/p-fail": jsonAnswer({
      ...failed,
      project: { ...failed.project, id: "p-fail" },
    }),
    "GET /api/projects/p-wait/checkpoints": checkpoints("held"),
    "GET /api/schedules": jsonAnswer({
      schedules: [
        {
          id: scheduleId,
          name: "Mondays and Thursdays",
          templateId,
          templateVersion: 1,
          cadence: { kind: "daily", time: "09:00" },
          timezone: "UTC",
          missedPolicy: "skip",
          overlapPolicy: "skip",
          spendLimitCents: null,
          items: [],
          topicGeneration: { mode: "hold", keepAtLeast: 10, llm: null },
          topics: {
            held: 5,
            generatingSince: null,
            generatedAt: null,
            failedAt: null,
            error: null,
          },
          status: "active",
          version: 1,
          nextRunAt: null,
          createdAt: "x",
          updatedAt: "x",
          deletedAt: null,
        },
      ],
    }),
    "GET /api/calendar": jsonAnswer({
      from: "x",
      to: "y",
      runs: [
        {
          at: new Date(Date.now() + 86_400_000).toISOString(),
          scheduleId,
          scheduleName: "Mondays and Thursdays",
          scheduleVersion: 1,
          paused: false,
          templateId,
          templateVersion: 1,
          templateName: "History",
          index: 0,
          topic: "Nefertiti",
          topicSource: "queued",
        },
      ],
      projects: [],
      queued: [],
    }),
    "GET /api/project-templates": jsonAnswer({
      templates: [
        { id: templateId, name: "History", version: 1, updatedAt: "x", channelId: channel },
      ],
    }),
    "GET /api/home/week": jsonAnswer({
      since: "x",
      videos: 3,
      calls: 40,
      cost: 9.4,
      unpriced: 0,
      apiEquivalent: 31,
      plans: [
        {
          account: "codex",
          name: "Codex",
          weeklyPercent: 41,
          fiveHourPercent: 10,
          weeklyResetsAt: null,
          readAt: "x",
        },
      ],
    }),
    ...extra,
  });
}

describe("home", () => {
  it("shows what needs you: a held review, suggested topics and a failure with its fix", async () => {
    renderRouted(<HomeRoute />, deps());
    const needs = await screen.findByRole("region", { name: "Needs you" });
    expect(await within(needs).findByRole("button", { name: "Approve and render" })).not.toBeNull();
    expect(within(needs).getByText("Waiting for you · review before the video")).not.toBeNull();
    expect(within(needs).getByText("5 new topics")).not.toBeNull();
    expect(within(needs).getByRole("link", { name: "Review topics" }).getAttribute("href")).toBe(
      "/calendar",
    );
    expect(await within(needs).findByText("Failed · Images")).not.toBeNull();
    expect(within(needs).getByText("3 things are waiting for you")).not.toBeNull();
  });

  it("approves a held review from Home", async () => {
    const user = userEvent.setup();
    const approve = vi.fn(
      jsonAnswer({
        checkpoint: {
          projectId: "p-wait",
          revisionId: "r1",
          checkpointId: "video-gate",
          workId: "w1",
          stage: "video",
          fingerprint: "a".repeat(64),
          state: "released",
          createdAt: "2026-09-13T00:00:00.000Z",
          approvedAt: "2026-09-13T00:00:00.000Z",
        },
        replayed: false,
      }),
    );
    renderRouted(
      <HomeRoute />,
      deps({ "POST /api/projects/p-wait/checkpoints/video-gate/approve": approve }),
    );
    await user.click(await screen.findByRole("button", { name: "Approve and render" }));
    await waitFor(() => expect(approve).toHaveBeenCalledOnce());
    const sent = JSON.parse(
      (await (approve.mock.calls[0]?.[0] as Request | undefined)?.text()) ?? "{}",
    );
    expect(sent).toMatchObject({ revisionId: "r1", fingerprint: "a".repeat(64) });
  });

  it("shows the running run's steps and the images as they land", async () => {
    renderRouted(<HomeRoute />, deps());
    const running = await screen.findByRole("region", { name: "Running now" });
    const steps = await within(running).findByRole("list", { name: "Steps of Sargon" });
    expect(await within(steps).findByText("Article")).not.toBeNull();
    expect(within(steps).getByText("7 min")).not.toBeNull();
    // No start time to measure the rate against: the time left is unknown, and says so.
    expect(within(steps).getByText("2 of 8 · time left unknown")).not.toBeNull();
    const images = within(running).getByRole("list", { name: "Images of Sargon" });
    expect(within(images).getAllByRole("img")).toHaveLength(2);
    expect(within(images).getByText("Drawing · 2 so far")).not.toBeNull();
  });

  it("says a running step's time left from its rate so far", async () => {
    const going = body({
      status: "running",
      stages: [
        stage("images", "running", {
          startedAt: new Date(Date.now() - 240_000).toISOString(),
          progressCurrent: 2,
          progressTotal: 8,
        }),
      ],
      outputs: [],
    });
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [listing("p-hyp", "Hypatia", "running", { progress: 0.2 })],
        }),
        "GET /api/projects/p-hyp": jsonAnswer({
          ...going,
          project: { ...going.project, id: "p-hyp" },
        }),
      }),
    );
    const steps = await screen.findByRole("list", { name: "Steps of Hypatia" });
    expect(await within(steps).findByText("2 of 8 · about 12 min left")).not.toBeNull();
  });

  it("lists what is coming up, what is ready to upload and this week's numbers", async () => {
    renderRouted(<HomeRoute />, deps());
    const coming = await screen.findByRole("region", { name: "Coming up" });
    expect(await within(coming).findByText(/· Nefertiti$/)).not.toBeNull();
    const ready = screen.getByRole("region", { name: "Ready to upload" });
    expect(within(ready).getByRole("link", { name: "Ashurbanipal" })).not.toBeNull();
    // Marked uploaded: not listed.
    expect(within(ready).queryByRole("link", { name: "Hypatia" })).toBeNull();
    expect(within(ready).getByRole("button", { name: "Prepare upload" })).not.toBeNull();
    const week = screen.getByRole("region", { name: "This week" });
    expect(await within(week).findByText("$9.40")).not.toBeNull();
    expect(within(week).getByText("spent · ~$31.00 via API")).not.toBeNull();
    expect(within(week).getByRole("meter", { name: "Weekly Codex limit" })).not.toBeNull();
  });

  it("keeps the bundled samples off Ready to upload", async () => {
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/onboarding": jsonAnswer({
          show: false,
          sampleProjectId: "p-done",
          samples: { library: "p-done", audiobook: null, podcast: null },
          clis: [],
          packs: [],
        }),
      }),
    );
    const ready = await screen.findByRole("region", { name: "Ready to upload" });
    // Loaded (the projects and which of them are samples), and only then without the sample.
    await waitFor(() => {
      expect(
        within(ready).getByText("Finished videos you haven't marked uploaded show here"),
      ).not.toBeNull();
      expect(screen.getByText("Sargon")).not.toBeNull();
      expect(within(ready).queryByRole("link", { name: "Ashurbanipal" })).toBeNull();
    });
  });

  it("says under Running now when a run waits for a CLI's limits", async () => {
    const resetsAt = new Date();
    resetsAt.setHours(14, 0, 0, 0);
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [
            listing("p-run", "Sargon", "running", {
              limitWaits: [
                {
                  name: "Codex",
                  stage: "images",
                  resetsAt: resetsAt.toISOString(),
                  retryAt: resetsAt.toISOString(),
                },
              ],
            }),
          ],
        }),
      }),
    );
    const running = await screen.findByRole("region", { name: "Running now" });
    const time = resetsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    expect(
      await within(running).findByText(`Waiting for Codex limits (resets at ${time})`),
    ).not.toBeNull();
  });

  it("copies a signed-out CLI's sign-in command from Needs you", async () => {
    const user = userEvent.setup();
    const signedOut = body({
      status: "failed",
      stages: [
        stage("images", "failed", {
          failureReason: "The Codex CLI is not signed in, or its sign-in has expired.",
        }),
      ],
      outputs: [],
    });
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects/p-fail": jsonAnswer({
          ...signedOut,
          project: { ...signedOut.project, id: "p-fail" },
        }),
      }),
    );
    const needs = await screen.findByRole("region", { name: "Needs you" });
    await user.click(await within(needs).findByRole("button", { name: "Copy sign-in command" }));
    expect(await navigator.clipboard.readText()).toBe("codex login");
    expect(within(needs).getByRole("link", { name: "Open to retry" })).not.toBeNull();
  });

  it("lists a paused run under Needs you, not Running now", async () => {
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [listing("p-pause", "Xerxes", "paused", { progress: 0.5 })],
        }),
      }),
    );
    const needs = await screen.findByRole("region", { name: "Needs you" });
    expect(await within(needs).findByText("Paused")).not.toBeNull();
    expect(within(needs).getByRole("link", { name: "Open to continue" })).not.toBeNull();
    const running = screen.getByRole("region", { name: "Running now" });
    expect(within(running).queryByText("Xerxes")).toBeNull();
    expect(within(running).getByText("Nothing is running")).not.toBeNull();
  });

  it("links to every running run past the first three and names the queued ones", async () => {
    const running = body({ status: "running", stages: [], outputs: [] });
    const ids = ["r1", "r2", "r3", "r4"];
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [
            ...ids.map((id) => listing(id, `Run ${id}`, "running", { progress: 0.2 })),
            listing("q1", "Hypatia", "pending"),
            listing("q2", "Cleopatra", "pending"),
            listing("q3", "Nefertiti", "pending"),
          ],
        }),
        ...Object.fromEntries(
          ids.map((id) => [
            `GET /api/projects/${id}`,
            jsonAnswer({ ...running, project: { ...running.project, id } }),
          ]),
        ),
      }),
    );
    const region = await screen.findByRole("region", { name: "Running now" });
    const all = await within(region).findByRole("link", { name: "See all 4 running" });
    expect(all.getAttribute("href")).toBe("/projects?show=running");
    expect(within(region).getByText("Hypatia, Cleopatra and 1 more")).not.toBeNull();
    expect(within(region).getByRole("link", { name: "See queued" }).getAttribute("href")).toBe(
      "/projects?show=queued",
    );
  });

  it("shows queued runs instead of the empty state when nothing runs yet", async () => {
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({ projects: [listing("q1", "Hypatia", "pending")] }),
      }),
    );
    const region = await screen.findByRole("region", { name: "Running now" });
    expect(await within(region).findByText("Hypatia")).not.toBeNull();
    expect(within(region).queryByText("Start the next video")).toBeNull();
    expect(within(region).queryByRole("link", { name: /See all/ })).toBeNull();
  });

  it("marks a finished video uploaded", async () => {
    const user = userEvent.setup();
    const put = vi.fn(jsonAnswer({ uploadedAt: "2026-09-27T10:00:00.000Z" }));
    renderRouted(<HomeRoute />, deps({ "PUT /api/projects/p-done/uploaded": put }));
    const ready = await screen.findByRole("region", { name: "Ready to upload" });
    await user.click(await within(ready).findByRole("button", { name: "Mark uploaded" }));
    await waitFor(() => expect(put).toHaveBeenCalledOnce());
    expect(
      JSON.parse((await (put.mock.calls[0]?.[0] as Request | undefined)?.text()) ?? "{}"),
    ).toEqual({
      uploaded: true,
    });
  });
});

describe("home's pieces", () => {
  it("starts the week on Monday", () => {
    const monday = startOfWeek(new Date(2026, 8, 27, 15));
    expect([monday.getDate(), monday.getDay(), monday.getHours()]).toEqual([21, 1, 0]);
  });

  it("says the calls with no price instead of counting them as free", () => {
    expect(
      spentLabel({
        since: "",
        videos: 0,
        calls: 3,
        cost: 1,
        unpriced: 2,
        apiEquivalent: null,
        plans: [],
      }),
    ).toBe("spent · 2 calls without a price");
  });
});

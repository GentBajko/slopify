import type { ProjectState } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startOfWeek } from "@/home/api";
import { spentLabel } from "@/home/week";
import { revisionView } from "@/project/revision-fixture";
import { type Answer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { HomeRoute } from "./home.js";
import { body, output, recoveryAccepted, stage } from "./project-fixtures.js";

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

// The checkpoint holding Cleopatra's run for the person, as the project list carries it.
const videoHold = {
  checkpointId: "video-gate",
  stage: "video",
  waitsFor: "person",
  revisionId: "r1",
  fingerprint: "a".repeat(64),
  since: "2026-09-13T00:00:00.000Z",
} as const;

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
  const waiting = body({ status: "pending", stages: [], outputs: [] });
  return testDeps({
    "GET /api/projects": jsonAnswer({
      projects: [
        listing("p-run", "Sargon", "running", { progress: 0.4 }),
        listing("p-wait", "Cleopatra", "pending", { progress: 0.6, holding: [videoHold] }),
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
    "GET /api/projects/p-wait": jsonAnswer({
      ...waiting,
      project: { ...waiting.project, id: "p-wait" },
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
    expect(within(needs).getByText("Waiting for your review · before the video")).not.toBeNull();
    expect(within(needs).getByText("5 new topics")).not.toBeNull();
    expect(within(needs).getByRole("link", { name: "Review topics" }).getAttribute("href")).toBe(
      "/calendar",
    );
    expect(await within(needs).findByText("Failed · Images")).not.toBeNull();
    expect(within(needs).getByText("3 decisions waiting · 1 ready to upload")).not.toBeNull();
  });

  // A schedule's prepared project waits for its day and a run parked on
  // an agent's review waits for the agent; neither asks anything of the person.
  it("keeps a prepared project and a run waiting for the agent off Needs you", async () => {
    const parked = body({
      status: "pending",
      stages: [stage("article", "done"), stage("images", "pending")],
      outputs: [],
    });
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [
            listing("p-wait", "Cleopatra", "pending", { progress: 0.6 }),
            listing("p-prep", "Nefertiti", "pending", { progress: 0.9, prepared: true }),
            listing("p-agent", "Hatshepsut", "pending", { progress: 0.5, waitingForAgent: true }),
          ],
        }),
        "GET /api/projects/p-agent": jsonAnswer({
          ...parked,
          project: { ...parked.project, id: "p-agent", waitingForAgent: true },
        }),
      }),
    );
    const needs = await screen.findByRole("region", { name: "Needs you" });
    expect(await within(needs).findByText("Cleopatra")).not.toBeNull();
    expect(within(needs).queryByText("Nefertiti")).toBeNull();
    expect(within(needs).queryByText("Hatshepsut")).toBeNull();
    // The agent's run goes on by itself, so it sits with the running ones and says why it stopped.
    const running = screen.getByRole("region", { name: "Running now" });
    expect(within(running).getByText("Hatshepsut")).not.toBeNull();
    expect(within(running).getByText("Waiting for the agent")).not.toBeNull();
  });

  // A restart stopped it: Home says so and continues it, as its page would.
  it("lists a stopped run under Needs you as Stopped and continues it from Home", async () => {
    const user = userEvent.setup();
    const resume = vi.fn(() => Response.json(recoveryAccepted));
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [listing("p-stop", "Ramesses", "pending", { progress: 0.5, stopped: true })],
        }),
        "POST /api/projects/p-stop/revisions/prepare": jsonAnswer({
          ok: true,
          view: revisionView(),
          created: false,
        }),
        "POST /api/projects/p-stop/resume": resume,
      }),
    );
    const needs = await screen.findByRole("region", { name: "Needs you" });
    expect(await within(needs).findByText("Stopped")).not.toBeNull();
    expect(within(needs).queryByText("Waiting for your review")).toBeNull();
    await user.click(within(needs).getByRole("button", { name: "Continue the run" }));
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
    expect(within(needs).getByRole("button", { name: "Keep as is" })).not.toBeNull();
  });

  it("keeps a stopped run as is from Home, and says why it didn't continue", async () => {
    const user = userEvent.setup();
    const keep = vi.fn(jsonAnswer({ setAside: true }));
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [listing("p-stop", "Ramesses", "pending", { progress: 0.5, stopped: true })],
        }),
        "POST /api/projects/p-stop/revisions/prepare": jsonAnswer({
          ok: true,
          view: revisionView(),
          created: false,
        }),
        "POST /api/projects/p-stop/resume": problemAnswer(
          "This project changed since the page loaded. Reload the page to see the latest, then use Continue the run again.",
          409,
        ),
        "PUT /api/projects/p-stop/set-aside": keep,
      }),
    );
    const needs = await screen.findByRole("region", { name: "Needs you" });
    await user.click(await within(needs).findByRole("button", { name: "Continue the run" }));
    expect(
      await within(needs).findByText(
        "It didn't continue: This project changed since the page loaded. Reload the page to see the latest, then use Continue the run again.",
      ),
    ).not.toBeNull();
    await user.click(within(needs).getByRole("button", { name: "Keep as is" }));
    await waitFor(() => expect(keep).toHaveBeenCalledOnce());
    expect(
      JSON.parse((await (keep.mock.calls[0]?.[0] as Request | undefined)?.text()) ?? "{}"),
    ).toEqual({ setAside: true });
    expect(await screen.findByText(/Kept as is: Ramesses\. It is off Needs you/)).not.toBeNull();
  });

  // Only a checkpoint the run has reached holds it (`holding`); one further on is not offered.
  it("offers the checkpoint that holds the run, not one the run hasn't reached", async () => {
    const gate = (checkpointId: string, stage: "audio" | "video") => ({
      projectId: "p-wait",
      revisionId: "r1",
      checkpointId,
      workId: "w1",
      stage,
      state: "held",
      fingerprint: "a".repeat(64),
      currentFingerprint: "a".repeat(64),
      createdAt: "2026-09-13T00:00:00.000Z",
      approvedAt: null,
      dependents: [],
      workKeys: [],
    });
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects/p-wait/checkpoints": jsonAnswer({
          revisionId: "r1",
          checkpoints: [gate("audio-gate", "audio"), gate("video-gate", "video")],
        }),
      }),
    );
    const needs = await screen.findByRole("region", { name: "Needs you" });
    expect(await within(needs).findByRole("button", { name: "Approve and render" })).not.toBeNull();
    expect(
      within(needs).queryByRole("button", { name: "Approve the article and record" }),
    ).toBeNull();
  });

  // A schedule's own hold waits for its day, not for the person: Home offers no approval.
  it("offers no approval for a hold that waits for its day", async () => {
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [
            listing("p-wait", "Cleopatra", "pending", {
              progress: 0.6,
              holding: [{ ...videoHold, waitsFor: "day" }],
            }),
          ],
        }),
      }),
    );
    const needs = await screen.findByRole("region", { name: "Needs you" });
    expect(await within(needs).findByRole("link", { name: "Open to continue" })).not.toBeNull();
    expect(within(needs).queryByRole("button", { name: "Approve and render" })).toBeNull();
  });

  it("says a held review that didn't load, and where to review it", async () => {
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects/p-wait/checkpoints": problemAnswer("Slopify isn't responding.", 503),
      }),
    );
    const needs = await screen.findByRole("region", { name: "Needs you" });
    expect(
      await within(needs).findByText(
        "Its review didn't load: Slopify isn't responding. Open the project to review it there.",
      ),
    ).not.toBeNull();
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
    const user = userEvent.setup();
    renderRouted(<HomeRoute />, deps());
    const coming = await screen.findByRole("region", { name: "Coming up" });
    expect(await within(coming).findByText(/· Nefertiti$/)).not.toBeNull();
    // Finished videos share the work list with the decisions, after them.
    const ready = await screen.findByRole("region", { name: "Needs you" });
    expect(within(ready).getByRole("link", { name: "Ashurbanipal" })).not.toBeNull();
    expect(within(ready).getByText("Ready to upload")).not.toBeNull();
    // Marked uploaded: not listed.
    expect(within(ready).queryByRole("link", { name: "Hypatia" })).toBeNull();
    expect(within(ready).getByRole("button", { name: "Prepare upload" })).not.toBeNull();
    // The week's totals are on request.
    const week = screen.getByRole("region", { name: "This week" });
    expect(within(week).queryByText("$9.40")).toBeNull();
    await user.click(within(week).getByRole("button", { name: "Show totals" }));
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
    const ready = await screen.findByRole("region", { name: "Needs you" });
    // Loaded (the projects and which of them are samples), and only then without the sample.
    await waitFor(() => {
      expect(within(ready).getByText("3 decisions waiting")).not.toBeNull();
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

  // Kept as is wins over waiting for the agent, as in its state word: nothing of it runs.
  it("leaves a run Kept as is out of Running now while an agent's review waits", async () => {
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [
            listing("p-run", "Sargon", "running", { progress: 0.4 }),
            listing("p-kept", "Hatshepsut", "pending", {
              progress: 0.5,
              waitingForAgent: true,
              setAside: true,
            }),
          ],
        }),
      }),
    );
    const running = await screen.findByRole("region", { name: "Running now" });
    expect(await within(running).findByText("Sargon")).not.toBeNull();
    expect(within(running).queryByText("Hatshepsut")).toBeNull();
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
    // Nothing runs, so there is no Running now section at all.
    expect(screen.queryByRole("region", { name: "Running now" })).toBeNull();
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

  it("lists a run stopped at its start under Needs you, not as queued under Running now", async () => {
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({
          projects: [listing("s1", "Hypatia", "pending", { stopped: true })],
        }),
      }),
    );
    const needs = await screen.findByRole("region", { name: "Needs you" });
    expect(await within(needs).findByText("Hypatia")).not.toBeNull();
    // Nothing runs or waits its turn, so Running now has nothing to show.
    expect(screen.queryByRole("region", { name: "Running now" })).toBeNull();
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
    const ready = await screen.findByRole("region", { name: "Needs you" });
    await user.click(await within(ready).findByRole("button", { name: "Mark uploaded" }));
    await waitFor(() => expect(put).toHaveBeenCalledOnce());
    expect(
      JSON.parse((await (put.mock.calls[0]?.[0] as Request | undefined)?.text()) ?? "{}"),
    ).toEqual({
      uploaded: true,
    });
  });
});

describe("home's load states", () => {
  it("says the projects didn't load, with Retry, instead of an empty Home", async () => {
    const user = userEvent.setup();
    let fail = true;
    const projects = vi.fn((request: Request) =>
      fail
        ? problemAnswer("The server stopped answering.", 503)(request)
        : jsonAnswer({ projects: [listing("p-run", "Sargon", "running")] })(request),
    );
    renderRouted(<HomeRoute />, deps({ "GET /api/projects": projects }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your projects didn't load");
    expect(alert.textContent).toContain("The server stopped answering.");
    expect(screen.queryByText("Nothing needs you and nothing is running")).toBeNull();
    expect(screen.queryByRole("region", { name: "Needs you" })).toBeNull();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("region", { name: "Running now" })).not.toBeNull();
    expect(screen.queryByText("Your projects didn't load", { exact: false })).toBeNull();
  });

  it("says once that nothing needs you when that is true, and hides empty sections", async () => {
    renderRouted(
      <HomeRoute />,
      deps({
        "GET /api/projects": jsonAnswer({ projects: [] }),
        "GET /api/schedules": jsonAnswer({ schedules: [] }),
      }),
    );
    expect(await screen.findByText("Nothing needs you and nothing is running")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Needs you" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Running now" })).toBeNull();
    // No schedules: nothing to come up.
    await waitFor(() => expect(screen.queryByRole("region", { name: "Coming up" })).toBeNull());
  });

  it("says the calendar didn't load under Coming up, with Retry", async () => {
    renderRouted(
      <HomeRoute />,
      deps({ "GET /api/calendar": problemAnswer("The calendar query failed.", 500) }),
    );
    const coming = await screen.findByRole("region", { name: "Coming up" });
    expect(
      (await within(coming).findByRole("alert")).textContent?.startsWith(
        "The calendar didn't load: The calendar query failed.",
      ),
    ).toBe(true);
    expect(within(coming).getByRole("button", { name: "Retry" })).not.toBeNull();
    expect(within(coming).queryByText("No scheduled runs in the next 7 days.")).toBeNull();
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

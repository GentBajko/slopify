import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { revisionView } from "@/project/revision-fixture";
import {
  downloadItem,
  jsonAnswer,
  openEditSection,
  openProjectEditor,
  openProjectTab,
  renderRouted,
  testOrigin,
} from "@/test-app";
import { ProjectRoute } from "./project";
import { body, deps, output, ready, recoveryAccepted, stage } from "./project-fixtures";

afterEach(cleanup);

function paused() {
  return body({
    status: "paused",
    stages: [stage("article", "done"), stage("audio", "pending"), stage("video", "pending")],
    outputs: [output("article_md", "article")],
  });
}

const extraProviders = [
  ...ready,
  {
    id: "claude-code",
    family: "llm",
    displayName: "Claude Code",
    readiness: { kind: "cli", installed: true },
  },
  {
    id: "cartesia",
    family: "tts",
    displayName: "Cartesia",
    readiness: { kind: "keyed", hasKey: true },
  },
  {
    id: "google-image",
    family: "image",
    displayName: "Google",
    readiness: { kind: "keyed", hasKey: true },
  },
];

import { revisionRouteFixture } from "./project-revision.fake.js";

describe("project pause and provider changes", () => {
  it("offers Continue the run for a failed revisioned project", async () => {
    const current = paused();
    const fixture = revisionRouteFixture({
      ...current,
      project: { ...current.project, status: "failed" },
    });
    renderRouted(<ProjectRoute projectId="p1" />, deps(fixture.routes));
    expect(
      (await screen.findByRole("button", { name: "Continue the run" })).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("offers Continue the run for a pending revision whose unfinished work nothing admitted", async () => {
    const user = userEvent.setup();
    const current = paused();
    const fixture = revisionRouteFixture({
      ...current,
      resumable: true,
      project: { ...current.project, status: "pending" },
    });
    const resume = vi.fn(() => Response.json(recoveryAccepted));
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({ ...fixture.routes, "POST /api/projects/p1/resume": resume }),
    );
    await user.click(await screen.findByRole("button", { name: "Continue the run" }));
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  });

  // A restart held it: the header says so, the line under it says what Continue does, and
  // nothing is to approve.
  it("reads a run a restart stopped as Stopped in its header and its next action", async () => {
    const current = paused();
    const fixture = revisionRouteFixture({
      ...current,
      resumable: true,
      project: { ...current.project, status: "pending", stopped: true },
    });
    renderRouted(<ProjectRoute projectId="p1" />, deps(fixture.routes));
    expect(await screen.findByRole("button", { name: "Continue the run" })).not.toBeNull();
    expect(screen.getByText("Stopped")).not.toBeNull();
    expect(screen.getByText(/^The run stopped before it finished\. Continuing/)).not.toBeNull();
    expect(screen.queryByText("Waiting for your review")).toBeNull();
  });

  // The run goes on once the agent answers; continuing would only park it.
  it("says a run parked on an agent's review waits for the agent, and offers no Continue the run", async () => {
    const current = paused();
    const fixture = revisionRouteFixture({
      ...current,
      resumable: false,
      project: { ...current.project, status: "pending", waitingForAgent: true },
    });
    renderRouted(<ProjectRoute projectId="p1" />, deps(fixture.routes));
    expect((await screen.findAllByText("Waiting for the agent")).length).toBeGreaterThan(0);
    expect(screen.getByText(/^An agent is reviewing what was made\./)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Continue the run" })).toBeNull();
    expect(screen.queryByText("Stopped")).toBeNull();
  });

  // The checkpoints the server says hold the run (`holding`) are the only ones the page offers.
  it("counts only the person's reached checkpoints, and reads a prepared video as Prepared", async () => {
    const gate = (checkpointId: string, stage: "audio" | "video") => ({
      projectId: "p1",
      revisionId: "r1",
      checkpointId,
      workId: "w1",
      stage,
      state: "held",
      fingerprint: "a".repeat(64),
      currentFingerprint: "a".repeat(64),
      createdAt: "2026-09-13T00:00:00.000Z",
      approvedAt: null,
      dependents: stage === "audio" ? ["video"] : [],
      workKeys: [`${stage}:main`],
    });
    const made = body({
      status: "pending",
      stages: [stage("article", "done"), stage("audio", "done"), stage("video", "pending")],
      outputs: [output("article_md", "article")],
    });
    const fixture = revisionRouteFixture(made);
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fixture.routes,
        "GET /api/projects/p1": jsonAnswer({
          ...made,
          revisionId: "r1",
          holding: [{ checkpointId: "video-gate", stage: "video", waitsFor: "day" }],
          project: { ...made.project, prepared: true },
        }),
        "GET /api/projects/p1/checkpoints": jsonAnswer({
          revisionId: "r1",
          // Approved earlier, the audio's gate holds nothing; the video's is the schedule's.
          checkpoints: [
            { ...gate("audio-gate", "audio"), state: "released" },
            gate("video-gate", "video"),
          ],
        }),
      }),
    );
    // Beside the video, where the page opens.
    const video = await screen.findByRole("region", { name: "Video" });
    expect(
      await within(video).findByText(
        "Everything but the video is made; its schedule renders the video on its day.",
      ),
    ).not.toBeNull();
    const rail = screen.getByRole("navigation", { name: "Project sections" });
    const row = within(rail).getByRole("link", { name: /^Video/ });
    expect(row.textContent).toBe("Video, Prepared");
    expect(row.nextElementSibling?.textContent).toBe("Its schedule makes it on its day.");
    expect(rail.textContent).not.toContain("Waiting for your review");
  });

  // A template's checkpoint the run hasn't reached yet is in the checkpoints list but not in
  // `holding`: the next action is the run, not an approval.
  it("offers no approval for a checkpoint the run hasn't reached", async () => {
    const going = body({
      status: "running",
      stages: [stage("article", "done"), stage("audio", "running"), stage("video", "pending")],
      outputs: [output("article_md", "article")],
    });
    const fixture = revisionRouteFixture(going);
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fixture.routes,
        "GET /api/projects/p1": jsonAnswer({ ...going, revisionId: "r1", holding: [] }),
        "GET /api/projects/p1/checkpoints": jsonAnswer({
          revisionId: "r1",
          checkpoints: [
            {
              projectId: "p1",
              revisionId: "r1",
              checkpointId: "video-gate",
              workId: "w1",
              stage: "video",
              state: "held",
              fingerprint: "a".repeat(64),
              currentFingerprint: "a".repeat(64),
              createdAt: "2026-09-13T00:00:00.000Z",
              approvedAt: null,
              dependents: [],
              workKeys: ["video:main"],
            },
          ],
        }),
      }),
    );
    expect(await screen.findByRole("button", { name: "Pause" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
    expect(screen.queryByText(/ready for your review/)).toBeNull();
  });

  it("continues a paused checkpoint project by keyboard, then offers the approval", async () => {
    const user = userEvent.setup();
    const fixture = revisionRouteFixture(paused());
    let resumed = false;
    const resume = vi.fn(() => {
      if (resume.mock.calls.length === 1)
        return Response.json(
          { title: "Conflict", status: 409, detail: "The project is still paused." },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        );
      resumed = true;
      return Response.json(recoveryAccepted);
    });
    const approve = vi.fn(() => Response.json({}));
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fixture.routes,
        "GET /api/projects/p1": () =>
          Response.json({
            ...paused(),
            revisionId: "r1",
            holding: [{ checkpointId: "audio-gate", stage: "audio", waitsFor: "person" }],
            project: { ...paused().project, status: resumed ? "pending" : "paused" },
          }),
        "GET /api/projects/p1/checkpoints": jsonAnswer({
          revisionId: "r1",
          checkpoints: [
            {
              projectId: "p1",
              revisionId: "r1",
              checkpointId: "audio-gate",
              workId: "w1",
              stage: "audio",
              state: "held",
              fingerprint: "a".repeat(64),
              currentFingerprint: "a".repeat(64),
              createdAt: "2026-09-13T00:00:00.000Z",
              approvedAt: null,
              dependents: ["video"],
              workKeys: ["audio:body", "video:main"],
            },
          ],
        }),
        "POST /api/projects/p1/resume": resume,
        "POST /api/projects/p1/checkpoints/audio-gate/approve": approve,
      }),
    );
    const rail = await screen.findByRole("navigation", { name: "Project sections" });
    // The held review is the narration's: its row says what to do.
    await waitFor(() =>
      expect(within(rail).getByRole("link", { name: /^Narration/ }).textContent).toBe(
        "Narration, Waiting for your review",
      ),
    );
    await openProjectTab("Pauses and checks");
    // Paused: continuing comes first, and the held review cannot be approved yet.
    const approval = await screen.findByRole("button", { name: "Approve and make the narration" });
    expect(approval.hasAttribute("disabled")).toBe(true);
    const next = screen.getByRole("heading", { level: 1 }).closest("header") as HTMLElement;
    const button = within(next).getByRole("button", { name: "Continue the run" });
    button.focus();
    await user.keyboard("{Enter}");
    await screen.findByText("The project is still paused.");
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    button.focus();
    await user.keyboard("{Enter}");
    // Once it runs, the review it waits on is the next action, and Pauses and checks offers
    // the same approval where the person is looking.
    expect(
      await within(next).findByRole("button", { name: "Approve and make the narration" }),
    ).not.toBeNull();
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("button", { name: "Approve and make the narration" })
          .find((button) => button.closest("header") === null)
          ?.hasAttribute("disabled"),
      ).toBe(false),
    );
    await openProjectTab("Edit");
    expect(await screen.findByRole("form", { name: "Edit project" })).not.toBeNull();
    expect(resume).toHaveBeenCalledTimes(2);
    expect(approve).not.toHaveBeenCalled();
    expect(fixture.start).not.toHaveBeenCalled();
  });

  it("saves provider and chunking edits through a revision without starting work", async () => {
    const user = userEvent.setup();
    const fixture = revisionRouteFixture(paused());
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        ...fixture.routes,
        "GET /api/providers": jsonAnswer({ providers: extraProviders }),
        "GET /api/settings/voices": jsonAnswer({
          voices: [{ id: "v2", provider: "cartesia", voiceId: "new-voice", name: "New voice" }],
        }),
      }),
    );
    await openProjectEditor();
    // Each stage's service sits in that stage's section, in Create's words.
    await openEditSection("Article");
    // Pauses and checks asks for its checker's Service and Model too; these are the writer's.
    const writer = within(await screen.findByRole("region", { name: "Written by" }));
    await user.selectOptions(writer.getByLabelText("Service"), "claude-code");
    await user.click(writer.getByRole("button", { name: "Enter Model ID" }));
    await user.type(writer.getByRole("textbox", { name: "Model" }), "sonnet");
    await openEditSection("Narration");
    await user.selectOptions(screen.getByLabelText("Voice service"), "cartesia");
    await user.click(screen.getByRole("button", { name: "Enter Voice model ID" }));
    await user.type(screen.getByRole("textbox", { name: "Voice model" }), "sonic-3");
    await user.selectOptions(screen.getByLabelText("Voice"), "new-voice");
    await user.click(screen.getByRole("radio", { name: "Every 3000 characters" }));
    await user.clear(screen.getByLabelText("Characters"));
    await user.type(screen.getByLabelText("Characters"), "1800");
    await openEditSection("Images");
    await user.selectOptions(screen.getByLabelText("Image service"), "google-image");
    await user.click(screen.getByRole("button", { name: "Enter Image model ID" }));
    await user.type(screen.getByRole("textbox", { name: "Image model" }), "image-model");
    expect(screen.queryByRole("button", { name: "Run settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save providers" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fixture.save).toHaveBeenCalledOnce(), { timeout: 5_000 });
    // The settings open again on the version just saved, at the section they were on.
    await screen.findByText(
      "Saved as a new version. Nothing is made again until you choose to.",
      undefined,
      { timeout: 5_000 },
    );
    expect(
      within(screen.getByRole("navigation", { name: "Edit sections" }))
        .getByRole("button", { name: /^Images/ })
        .getAttribute("aria-current"),
    ).not.toBeNull();
    expect(fixture.view().revision.config).toMatchObject({
      llm: { provider: "claude-code", model: "sonnet" },
      audio: { provider: "cartesia", model: "sonic-3", voice: "new-voice" },
      images: { provider: "google-image", model: "image-model" },
      chunking: { mode: "characters", characters: 1800 },
    });
    expect(fixture.start).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue the run" })).not.toBeNull();
    // ceiling: some forty keystrokes and clicks; under a loaded full suite it has taken 4.5 s.
  }, 20_000);

  it("keeps a pending action bound to its original project after the page switches IDs", async () => {
    const user = userEvent.setup();
    const first = paused();
    const second = {
      ...first,
      project: { ...first.project, id: "p2", title: "Second project" },
      stages: [],
      outputs: [],
    };
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const pause = vi.fn(() => pending);
    function SwitchProjects() {
      const [id, setId] = useState("p1");
      return (
        <>
          <button type="button" onClick={() => setId("p2")}>
            Open another project
          </button>
          <ProjectRoute projectId={id} />
        </>
      );
    }
    renderRouted(
      <SwitchProjects />,
      deps({
        "GET /api/projects/p1": jsonAnswer({
          ...first,
          project: { ...first.project, status: "running" },
        }),
        "GET /api/projects/p2": jsonAnswer(second),
        "POST /api/projects/p1/revisions/prepare": jsonAnswer({
          ok: true,
          view: revisionView(),
          created: true,
        }),
        "POST /api/projects/p1/pause": pause,
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Pause" }));
    await waitFor(() => expect(pause).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Open another project" }));
    await screen.findByRole("heading", { name: "Second project" });
    await act(async () => {
      release?.(await jsonAnswer(first)(new Request(testOrigin)));
    });
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Continue the run" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(screen.getByRole("heading", { name: "Second project" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Rope Tricks" })).toBeNull();
  });

  it("keeps finished narration labeled with its original voice after changing the configured voice", async () => {
    const current = paused();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer({
          ...current,
          project: {
            ...current.project,
            config: {
              ...current.project.config,
              audio: { provider: "cartesia", model: "sonic-3", voice: "new-voice" },
            },
          },
          stages: [stage("audio", "done")],
          outputs: [
            output("audio_body", "audio", {
              meta: { provider: "elevenlabs", voice: "narrator-m", model: "v3" },
            }),
          ],
        }),
        "GET /api/providers": jsonAnswer({ providers: extraProviders }),
        "GET /api/providers/claude-code/models": jsonAnswer({
          models: [{ id: "sonnet", name: "Claude Sonnet" }],
          allowsCustom: true,
        }),
        "GET /api/providers/elevenlabs/models": jsonAnswer({
          models: [{ id: "eleven_multilingual_v2", name: "Multilingual v2" }],
          allowsCustom: true,
        }),
        "GET /api/providers/cartesia/models": jsonAnswer({
          models: [{ id: "sonic-3.5", name: "Sonic 3.5" }],
          allowsCustom: true,
        }),
        "GET /api/providers/fal/models": jsonAnswer({
          models: [{ id: "fal-ai/flux-2", name: "FLUX.2" }],
          allowsCustom: false,
        }),
        "GET /api/providers/google-image/models": jsonAnswer({
          models: [{ id: "gemini-3.1-flash-image", name: "Nano Banana 2" }],
          allowsCustom: true,
        }),

        "GET /api/settings/voices": jsonAnswer({
          voices: [
            { id: "old", provider: "elevenlabs", voiceId: "narrator-m", name: "Original voice" },
            { id: "new", provider: "cartesia", voiceId: "new-voice", name: "New voice" },
          ],
        }),
      }),
    );
    await screen.findByText(/Voice Original voice/);
    const audio = within(document.querySelector('[data-tour="project-audio"]') as HTMLElement);
    expect(audio.queryByText("New voice")).toBeNull();
  });
});

describe("audio-only final export", () => {
  it("shows the combined WAV player and download on the final stage", async () => {
    const current = paused();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer({
          ...current,
          project: {
            ...current.project,
            status: "done",
            config: {
              ...current.project.config,
              sources: { ...current.project.config.sources, images: "off", video: "off" },
            },
          },
          stages: [stage("video", "done", { source: "off" })],
          outputs: [output("audio_export", "video", { path: "audio.wav", durationMs: 12000 })],
        }),
      }),
    );
    const download = await downloadItem("Audio (.wav)");
    expect(download.getAttribute("href")).toBe(`${testOrigin}/files/p1/audio-export`);
    const section = screen.getByRole("region", { name: "Audio export" });
    expect(within(section).getByLabelText("Combined narration").tagName).toBe("AUDIO");
    expect(screen.queryByRole("menuitem", { name: "Video (.mp4)" })).toBeNull();
    // In plain sight in the section's head, named for what it makes and what it costs.
    expect(
      within(section).getByRole("button", { name: "Make the audio file again (free)" }),
    ).not.toBeNull();
  });
});

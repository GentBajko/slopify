import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { revisionView } from "@/project/revision-fixture";
import { jsonAnswer, renderRouted, testOrigin } from "@/test-app";
import { ProjectRoute } from "./project";
import { body, deps, output, ready, stage } from "./project-fixtures";

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
    await user.click(await screen.findByRole("button", { name: "Edit project" }));
    await user.selectOptions(await screen.findByLabelText("Text provider"), "claude-code");
    await user.click(screen.getByRole("button", { name: "Enter Text model ID" }));
    await user.type(screen.getByRole("textbox", { name: "Text model" }), "sonnet");
    await user.selectOptions(screen.getByLabelText("Narration provider"), "cartesia");
    await user.click(screen.getByRole("button", { name: "Enter Narration model ID" }));
    await user.type(screen.getByRole("textbox", { name: "Narration model" }), "sonic-3");
    await user.selectOptions(screen.getByLabelText("Narration voice"), "new-voice");
    await user.selectOptions(screen.getByLabelText("Image provider"), "google-image");
    await user.click(screen.getByRole("button", { name: "Enter Image model ID" }));
    await user.type(screen.getByRole("textbox", { name: "Image model" }), "image-model");
    await user.click(screen.getByRole("radio", { name: "Every 3000 characters" }));
    await user.clear(screen.getByLabelText("Characters"));
    await user.type(screen.getByLabelText("Characters"), "1800");
    expect(screen.queryByRole("button", { name: "Run settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save providers" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fixture.save).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByLabelText("Project title")).toBeNull());
    expect(fixture.view().revision.config).toMatchObject({
      llm: { provider: "claude-code", model: "sonnet" },
      audio: { provider: "cartesia", model: "sonic-3", voice: "new-voice" },
      images: { provider: "google-image", model: "image-model" },
      chunking: { mode: "characters", characters: 1800 },
    });
    expect(fixture.start).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });

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
      expect((screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
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
    await screen.findByText("Original voice");
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
    const download = await screen.findByRole("link", { name: "Download .wav" });
    expect(download.getAttribute("href")).toBe(`${testOrigin}/files/p1/audio-export`);
    expect(screen.getByText("Audio export")).not.toBeNull();
    expect(screen.getByLabelText("Combined narration").tagName).toBe("AUDIO");
    expect(screen.queryByRole("link", { name: "Download .mp4" })).toBeNull();
    expect(screen.getByRole("button", { name: "Re-export" })).not.toBeNull();
  });
});

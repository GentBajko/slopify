import type { ProjectEvent } from "@app/edge/events/hub.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted, testOrigin } from "@/test-app";
import { ProjectRoute } from "./project";
import { body, deps, openRunSettings, output, ready, stage } from "./project-fixtures";

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

describe("project pause and provider changes", () => {
  it("blocks Resume until unsaved provider changes are saved or explicitly discarded", async () => {
    const user = userEvent.setup();
    const current = paused();
    const resume = vi.fn(jsonAnswer(current));
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(current),
        "POST /api/projects/p1/resume": resume,
      }),
    );
    await openRunSettings();
    await user.click(await screen.findByRole("button", { name: "Enter Text model ID" }));
    const model = screen.getByRole("textbox", { name: "Text model" });
    await user.clear(model);
    await user.type(model, "different-model");
    expect((screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("Save or discard provider changes before resuming.")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(resume).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard provider changes" }));
    expect((screen.getByLabelText("Text model") as HTMLInputElement).value).toBe(
      current.project.config.llm.model,
    );
    expect((screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("reconciles a late save response with newer configuration fetched from an SSE event", async () => {
    const user = userEvent.setup();
    let current = paused();
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const save = vi.fn(() => pending);
    const read = vi.fn((request: Request) => jsonAnswer(current)(request));
    const listeners = new Map<string, ((message: MessageEvent<string>) => void)[]>();
    const app = deps({
      "GET /api/projects/p1": read,
      "PATCH /api/projects/p1/providers": save,
    });
    renderRouted(<ProjectRoute projectId="p1" />, {
      ...app,
      openEvents: () => ({
        close: () => {},
        addEventListener: (name: string, listener: (message: MessageEvent<string>) => void) =>
          listeners.set(name, [...(listeners.get(name) ?? []), listener]),
      }),
    });
    await openRunSettings();
    await user.click(await screen.findByRole("button", { name: "Enter Text model ID" }));
    const model = screen.getByRole("textbox", { name: "Text model" });
    await user.clear(model);
    await user.type(model, "my-model");
    await user.click(screen.getByRole("button", { name: "Save providers" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const ownResult = {
      ...current,
      project: {
        ...current.project,
        config: { ...current.project.config, llm: { provider: "openrouter", model: "my-model" } },
      },
    };
    current = {
      ...current,
      project: {
        ...current.project,
        config: {
          ...current.project.config,
          llm: { provider: "openrouter", model: "newer-other-tab-model" },
        },
      },
    };
    const before = read.mock.calls.length;
    const event: ProjectEvent = { type: "project.updated", projectId: "p1" };
    act(() => {
      for (const listener of listeners.get(event.type) ?? [])
        listener(new MessageEvent(event.type, { data: JSON.stringify(event) }));
    });
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(before));
    await act(async () => {
      release?.(await jsonAnswer(ownResult)(new Request(testOrigin)));
    });
    await waitFor(() =>
      expect((screen.getByLabelText("Text model") as HTMLInputElement).value).toBe(
        "newer-other-tab-model",
      ),
    );
    expect((screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
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

  it("pauses, saves all three provider choices without running, then resumes separately", async () => {
    const user = userEvent.setup();
    let current = body({
      status: "running",
      stages: [stage("article", "done"), stage("audio", "running"), stage("video", "pending")],
      outputs: [output("article_md", "article")],
    });
    const pause = vi.fn((request: Request) => {
      current = paused();
      return jsonAnswer(current)(request);
    });
    const save = vi.fn(async (request: Request) => {
      const choices = await request.json();
      current = {
        ...current,
        project: { ...current.project, config: { ...current.project.config, ...choices } },
      };
      return jsonAnswer(current)(request);
    });
    const resume = vi.fn((request: Request) => {
      current = { ...current, project: { ...current.project, status: "running" } };
      return jsonAnswer(current)(request);
    });
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": (request) => jsonAnswer(current)(request),
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
          voices: [{ id: "voice", provider: "cartesia", voiceId: "new-voice", name: "New voice" }],
        }),
        "POST /api/projects/p1/pause": pause,
        "PATCH /api/projects/p1/providers": save,
        "POST /api/projects/p1/resume": resume,
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Pause" }));
    await screen.findByText("paused");
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await openRunSettings();
    await user.selectOptions(screen.getByLabelText("Text provider"), "claude-code");
    await user.selectOptions(screen.getByLabelText("Text model"), "sonnet");
    await user.selectOptions(screen.getByLabelText("TTS provider"), "cartesia");
    await user.selectOptions(screen.getByLabelText("TTS model"), "sonic-3.5");
    await user.selectOptions(screen.getByLabelText("Narration voice"), "new-voice");
    await user.selectOptions(screen.getByLabelText("Image provider"), "google-image");
    const imageModel = screen.getByLabelText("Image model") as HTMLSelectElement;
    await user.selectOptions(
      imageModel,
      Array.from(imageModel.options).find((option) => option.value !== "")?.value ?? "",
    );
    await user.click(screen.getByRole("button", { name: "Save providers" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Save providers" }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect(current.project.config).toMatchObject({
      llm: { provider: "claude-code", model: "sonnet" },
      audio: { provider: "cartesia", voice: "new-voice" },
      images: { provider: "google-image" },
    });
    expect(resume).not.toHaveBeenCalled();
    expect(screen.getByText("paused")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Pause" });
  });

  it("allows failed runs to edit providers and preserves a refused edit", async () => {
    const user = userEvent.setup();
    const current = paused();
    const failed = { ...current, project: { ...current.project, status: "failed" } };
    const save = vi.fn(problemAnswer("An active request has not stopped yet.", 409));
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer(failed),
        "PATCH /api/projects/p1/providers": save,
      }),
    );
    await openRunSettings();
    await user.click(await screen.findByRole("button", { name: "Enter Text model ID" }));
    const model = screen.getByRole("textbox", { name: "Text model" });
    await user.clear(model);
    await user.type(model, "anthropic/claude-sonnet-4");
    await user.click(screen.getByRole("button", { name: "Save providers" }));
    await screen.findByText("An active request has not stopped yet.");
    expect((screen.getByLabelText("Text model") as HTMLInputElement).value).toBe(
      "anthropic/claude-sonnet-4",
    );
    expect(screen.getByRole("button", { name: "Resume" })).not.toBeNull();
  });

  it("holds editing and Resume until in-flight stages stop", async () => {
    const current = paused();
    renderRouted(
      <ProjectRoute projectId="p1" />,
      deps({
        "GET /api/projects/p1": jsonAnswer({ ...current, stages: [stage("audio", "running")] }),
      }),
    );
    await openRunSettings();
    expect((screen.getByRole("button", { name: "Resume" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByLabelText("Text model").closest("fieldset")?.disabled).toBe(true);
    expect(screen.getByText(/waiting for active requests to stop/)).not.toBeNull();
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

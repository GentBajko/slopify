import type { Entry, Prompt } from "@app/slices/library/model.js";
import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { subtitleConfigSchema } from "@app/slices/subtitles/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Answer, jsonAnswer, renderApp, testDeps, testVersion } from "@/test-app";
import { PlayForm } from "./play.js";

const tutorial = vi.hoisted(() => ({
  event: vi.fn(),
  progress: vi.fn<(progress: Readonly<Record<string, boolean>>) => void>(),
}));

vi.mock("@/tutorial/context", () => ({
  useTutorialEvent: () => tutorial.event,
  useTutorialProgress: tutorial.progress,
}));

afterEach(() => {
  cleanup();
  tutorial.event.mockClear();
  tutorial.progress.mockClear();
});

const providers: readonly ProviderStatus[] = [
  {
    id: "openrouter",
    family: "llm",
    displayName: "OpenRouter",
    readiness: { kind: "keyed", hasKey: false },
  },
  {
    id: "claude-code",
    family: "llm",
    displayName: "Claude Code CLI",
    readiness: { kind: "cli", installed: true, version: "2.1.258" },
  },
  {
    id: "codex",
    family: "llm",
    displayName: "Codex CLI",
    readiness: { kind: "cli", installed: false },
  },
  {
    id: "elevenlabs",
    family: "tts",
    displayName: "ElevenLabs",
    readiness: { kind: "keyed", hasKey: true },
  },
  {
    id: "cartesia",
    family: "tts",
    displayName: "Cartesia",
    readiness: { kind: "keyed", hasKey: false },
  },
  { id: "fal", family: "image", displayName: "fal.ai", readiness: { kind: "keyed", hasKey: true } },
];

function prompt(kind: Prompt["kind"], name: string, body: string): Prompt {
  return { id: name, kind, name, body, slots: [], updatedAt: "2026-09-03T00:00:00.000Z" };
}

const prompts: readonly Prompt[] = [
  prompt("article", "Dossier", "Write about {{topic}} in {{minWords}} words."),
  prompt("image", "Oils", "An oil painting of {{topic}} in {{style}}."),
  prompt("image", "Maps", "A map of {{era}}."),
  prompt("thumbnail", "Title card", "A title card for {{topic}}."),
];

const entries: readonly Entry[] = [
  {
    id: "e1",
    category: "intro",
    mode: "text",
    name: "Cold open",
    body: "Hook them.",
    slots: [],
    updatedAt: "2026-09-03T00:00:00.000Z",
  },
  {
    id: "e2",
    category: "outro",
    mode: "llm",
    name: "Sting",
    body: "Write a sign-off.",
    slots: [],
    updatedAt: "2026-09-03T00:00:00.000Z",
  },
];

const voices: readonly Voice[] = [
  { id: "v1", provider: "elevenlabs", name: "Narrator M", voiceId: "eleven-narrator" },
  { id: "v2", provider: "cartesia", name: "Other", voiceId: "cartesia-other" },
];

function playRoutes(over: Readonly<Record<string, Answer>> = {}): Readonly<Record<string, Answer>> {
  return {
    "GET /api/providers": jsonAnswer({ providers }),
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

    "GET /api/prompts": jsonAnswer({ prompts }),
    "GET /api/entries": jsonAnswer({ entries }),
    "GET /api/settings/voices": jsonAnswer({ voices }),
    "GET /api/settings": jsonAnswer({ silenceGapSeconds: 3, appearance: "system" }),
    "POST /api/projects": jsonAnswer({ project: { id: "p1", status: "running" }, stages: [] }, 201),
    ...over,
  };
}

function fieldsAnswer(fields: readonly { field: string; message: string }[]): Answer {
  return () =>
    new Response(
      JSON.stringify({
        title: "Bad Request",
        status: 400,
        detail: "This run cannot start yet; the listed fields need attention.",
        fields,
      }),
      {
        status: 400,
        headers: {
          "content-type": "application/problem+json",
          "X-Slopify-Version": testVersion,
        },
      },
    );
}

function playKey(): HTMLElement {
  return screen.getByRole("button", { name: /PLAY/ });
}

function held(): boolean {
  return playKey().getAttribute("aria-disabled") === "true";
}

function pick(label: string, value: string): Promise<void> {
  return userEvent.selectOptions(screen.getByLabelText(label), value);
}

// One stage's segmented switch, scoped to its own rail: "Provide" is a segment of four
// of them.
function segment(stage: string, name: string): HTMLElement {
  return within(screen.getByRole("radiogroup", { name: `${stage} source` })).getByRole("radio", {
    name,
  });
}

// The images rail draws a Model above the cue sheet's LLM Model, in that order.
function modelPickers(): readonly HTMLElement[] {
  return screen.getAllByLabelText("Model");
}

async function mount(over: Readonly<Record<string, Answer>> = {}): Promise<() => void> {
  const created = vi.fn();
  renderApp(<PlayForm onCreated={created} />, testDeps(playRoutes(over)));
  // Every picker is filled from a list, so nothing can be chosen until they land.
  await screen.findByRole("option", { name: "Dossier" });
  return created;
}

// Fills the form for a run whose every stage is generated.
async function fillGeneratedRun(): Promise<void> {
  await pick("Article prompt", "Dossier");
  await pick("TTS", "elevenlabs");
  await pick("TTS model", "eleven_multilingual_v2");
  await pick("Voice", "eleven-narrator");
  await pick("Provider", "fal");
  const [imageModel] = modelPickers();
  if (imageModel !== undefined) {
    await userEvent.selectOptions(imageModel, "fal-ai/flux-2");
  }
  await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
  await pick("LLM", "claude-code");
  const llmModel = modelPickers()[1];
  if (llmModel !== undefined) {
    await userEvent.selectOptions(llmModel, "sonnet");
  }
  await userEvent.type(screen.getByLabelText("Video title"), "Rope Tricks");
  await userEvent.type(screen.getByLabelText("topic"), "rope");
  await userEvent.type(screen.getByLabelText("minWords"), "3000");
  await userEvent.type(screen.getByLabelText("style"), "oil on canvas");
}

describe("tutorial completion from the Play form", () => {
  it("tracks valid stage choices and keywords, and emits creation before leaving the form", async () => {
    const created = await mount();
    expect(tutorial.progress.mock.lastCall?.[0]).toEqual({
      playArticleReady: false,
      playAudioReady: false,
      playImagesReady: false,
      playVideoReady: true,
      playSubtitlesReady: true,
      playOptionsReady: false,
      playHasKeywords: false,
      playKeywordsReady: true,
      playReady: false,
    });

    await pick("Article prompt", "Dossier");
    expect(tutorial.progress.mock.lastCall?.[0]).toMatchObject({
      playArticleReady: true,
      playKeywordsReady: false,
      playReady: false,
    });
    await fillGeneratedRun();
    expect(tutorial.progress.mock.lastCall?.[0]).toEqual({
      playArticleReady: true,
      playAudioReady: true,
      playImagesReady: true,
      playVideoReady: true,
      playSubtitlesReady: true,
      playOptionsReady: true,
      playHasKeywords: true,
      playKeywordsReady: true,
      playReady: true,
    });
    expect(tutorial.event).not.toHaveBeenCalled();

    await userEvent.click(playKey());
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith("p1");
    });
    expect(tutorial.event).toHaveBeenCalledExactlyOnceWith({ type: "project-created", id: "p1" });
    const emittedAt = tutorial.event.mock.invocationCallOrder[0];
    const leftAt = vi.mocked(created).mock.invocationCallOrder[0];
    expect(emittedAt).toBeLessThan(leftAt ?? 0);
  });

  it("does not report a project when server admission refuses the run", async () => {
    await mount({
      "POST /api/projects": fieldsAnswer([
        { field: "articlePrompt", message: "That article prompt was deleted." },
      ]),
    });
    await fillGeneratedRun();
    await userEvent.click(playKey());

    await screen.findByText("That article prompt was deleted.");
    expect(tutorial.progress.mock.lastCall?.[0]?.playArticleReady).toBe(false);
    expect(tutorial.event).not.toHaveBeenCalled();
  });
});

describe("the Play key and its hint", () => {
  it("is held on a fresh form and names the first missing item", async () => {
    await mount();

    expect(held()).toBe(true);
    expect(screen.getByText("Pick an article prompt to play")).not.toBeNull();
    // The reason is announced with the key rather than only sitting beside it.
    const hint = screen.getByText("Pick an article prompt to play");
    expect(playKey().getAttribute("aria-describedby")).toBe(hint.id);
  });

  it("marks nothing on a form nobody has touched, and the named control once one is", async () => {
    await mount();

    expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("false");

    // Naming the run leaves the article prompt the first missing item, and now that the
    // user is configuring the run it is marked where it stands.
    await userEvent.type(screen.getByLabelText("Video title"), "Rope Tricks");

    expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Pick an article prompt.")).not.toBeNull();
  });

  it("moves the hint to the next missing item as the form fills", async () => {
    await mount();

    await pick("Article prompt", "Dossier");
    expect(screen.getByText("Pick a narration provider to play")).not.toBeNull();

    await pick("TTS", "elevenlabs");
    await pick("TTS model", "eleven_multilingual_v2");
    expect(screen.getByText("Pick a voice to play")).not.toBeNull();

    await pick("Voice", "eleven-narrator");
    expect(screen.getByText("Tick an image prompt to play")).not.toBeNull();
  });

  it("comes alive once every rail and the cue sheet are answered", async () => {
    const created = await mount();

    await fillGeneratedRun();

    await waitFor(() => {
      expect(held()).toBe(false);
    });
    expect(screen.queryByText(/to play$/)).toBeNull();

    await userEvent.click(playKey());
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith("p1");
    });
  });
});

describe("Ctrl+Enter", () => {
  it("does nothing while the run is not admissible", async () => {
    const created = await mount();

    await userEvent.click(screen.getByLabelText("Video title"));
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(created).not.toHaveBeenCalled();
  });

  it("presses Play once the run is admissible", async () => {
    const created = await mount();

    await fillGeneratedRun();
    await waitFor(() => {
      expect(held()).toBe(false);
    });

    await userEvent.click(screen.getByLabelText("Video title"));
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(created).toHaveBeenCalledWith("p1");
    });
  });
});

describe("the providers a run may use", () => {
  it("greys an unkeyed provider and a CLI that is not installed, and hides neither", async () => {
    await mount();

    const unkeyed = screen.getByRole("option", { name: /OpenRouter/ });
    const absent = screen.getByRole("option", { name: /Codex CLI/ });
    const cartesia = screen.getByRole("option", { name: /Cartesia/ });

    expect(unkeyed.textContent).toBe("OpenRouter · Key missing");
    expect(absent.textContent).toBe("Codex CLI · CLI missing");
    expect(cartesia.textContent).toBe("Cartesia · Key missing");
    expect(screen.getByRole("option", { name: "ElevenLabs" }).textContent).toBe("ElevenLabs");
  });

  it("offers only the voices of the picked narration provider", async () => {
    await mount();

    await pick("TTS", "elevenlabs");
    await pick("TTS model", "eleven_multilingual_v2");
    expect(screen.getByRole("option", { name: "Narrator M" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "Other" })).toBeNull();
  });
});

describe("the source switches", () => {
  it("offers each stage only the sources the rule allows it", async () => {
    await mount();

    expect(screen.getByRole("radiogroup", { name: "research source" }).textContent).toBe(
      "OffGenerateProvide",
    );
    expect(screen.getByRole("radiogroup", { name: "article source" }).textContent).toBe(
      "GenerateProvide",
    );
    expect(screen.getByRole("radiogroup", { name: "thumbnail source" }).textContent).toBe(
      "OffFrom promptPrompt by LLMProvide",
    );
    for (const kind of ["audio", "images"]) {
      expect(screen.getByRole("radiogroup", { name: `${kind} source` }).textContent).toBe(
        "OffGenerateProvide",
      );
    }
    expect(screen.getByRole("radiogroup", { name: "video source" }).textContent).toBe(
      "OffGenerate",
    );
  });

  it("swaps a stage's controls for its paste area, and hides research behind a provided article", async () => {
    await mount();

    expect(screen.getByLabelText("Article prompt")).not.toBeNull();
    expect(screen.getByRole("radiogroup", { name: "research source" })).not.toBeNull();

    await userEvent.click(segment("article", "Provide"));

    expect(screen.queryByLabelText("Article prompt")).toBeNull();
    expect(screen.getByLabelText("Article text")).not.toBeNull();
    // Research only feeds article writing.
    expect(screen.queryByRole("radiogroup", { name: "research source" })).toBeNull();
  });
});

describe("optional stages", () => {
  it("uses uploaded narration as-is and omits selected entry requirements", async () => {
    const posted = vi.fn(async (request: Request) => {
      const draft = await request.json();
      expect(draft).toMatchObject({
        sources: { article: "provide", audio: "provide", images: "off", video: "off" },
        provided: { audio: "uploaded-narration" },
        values: {},
      });
      expect(draft).not.toHaveProperty("intro");
      expect(draft).not.toHaveProperty("outro");
      return jsonAnswer({ project: { id: "uploaded-audio" }, stages: [] }, 201)(request);
    });
    const created = await mount({
      "GET /api/entries": jsonAnswer({ entries: [{ ...entries[1], body: "Write {{unused}}." }] }),
      "POST /api/staging/audio": jsonAnswer({
        id: "uploaded-narration",
        stageKind: "audio",
        path: "uploaded-narration",
        originalFilename: "narration.wav",
        bytes: 5,
        state: "staged",
        createdAt: "2026-09-09T20:00:00.000Z",
      }),
      "POST /api/projects": posted,
    });
    await pick("Outro", "Sting");
    await userEvent.click(segment("article", "Provide"));
    await userEvent.type(screen.getByLabelText("Article text"), "The full article.");
    await userEvent.click(segment("audio", "Provide"));
    expect(screen.queryByLabelText("Intro")).toBeNull();
    expect(screen.queryByLabelText("Outro")).toBeNull();
    expect(screen.queryByLabelText("unused")).toBeNull();
    expect(screen.queryByLabelText("LLM")).toBeNull();
    expect(
      screen.getByText(
        "Uploaded narration is used as-is; include any intro and outro in that file.",
      ),
    ).not.toBeNull();
    await userEvent.upload(
      screen.getByLabelText("Narration file"),
      new File(["audio"], "narration.wav", { type: "audio/wav" }),
    );
    await screen.findByText("Staged");
    await userEvent.click(segment("images", "Off"));
    await userEvent.type(screen.getByLabelText("Video title"), "Uploaded audio");
    expect(held()).toBe(false);
    await userEvent.click(playKey());
    await waitFor(() => expect(created).toHaveBeenCalledWith("uploaded-audio"));
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it("starts an article-only project without hidden provider, intro or keyword requirements", async () => {
    const posted = vi.fn(async (request: Request) => {
      const draft = await request.json();
      expect(draft).toMatchObject({
        sources: { article: "provide", research: "off", audio: "off", images: "off", video: "off" },
        values: {},
      });
      expect(draft).not.toHaveProperty("intro");
      expect(draft).not.toHaveProperty("outro");
      return jsonAnswer({ project: { id: "article-only" }, stages: [] }, 201)(request);
    });
    const created = await mount({
      "GET /api/entries": jsonAnswer({ entries: [{ ...entries[1], body: "Write {{unused}}." }] }),
      "POST /api/projects": posted,
    });
    await pick("Outro", "Sting");
    expect(screen.getByLabelText("unused")).not.toBeNull();
    await userEvent.click(segment("article", "Provide"));
    await userEvent.type(screen.getByLabelText("Article text"), "My finished article.");
    await userEvent.click(segment("audio", "Off"));
    await userEvent.click(segment("images", "Off"));
    expect(screen.queryByLabelText("Intro")).toBeNull();
    expect(screen.queryByLabelText("Outro")).toBeNull();
    expect(screen.queryByLabelText("unused")).toBeNull();
    expect(screen.queryByLabelText("LLM")).toBeNull();
    expect(segment("video", "Off").getAttribute("aria-checked")).toBe("true");
    expect((segment("video", "Generate") as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Video title"), "Article only");
    expect(held()).toBe(false);
    expect(tutorial.progress.mock.lastCall?.[0]).toMatchObject({
      playAudioReady: true,
      playImagesReady: true,
      playVideoReady: true,
      playSubtitlesReady: true,
    });
    await userEvent.click(playKey());
    await waitFor(() => expect(created).toHaveBeenCalledWith("article-only"));
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it("keeps silent video available without a TTS provider or voice", async () => {
    await mount();
    await fillGeneratedRun();
    await userEvent.click(segment("audio", "Off"));
    expect(screen.getByText("Silent video · 5 seconds per image")).not.toBeNull();
    expect(screen.queryByLabelText("TTS")).toBeNull();
    expect(held()).toBe(false);
    await userEvent.click(segment("video", "Off"));
    expect(screen.getByText("Download each enabled stage separately")).not.toBeNull();
    await userEvent.click(segment("audio", "Generate"));
    expect(screen.getByText("Combined WAV export with narration and segment gaps")).not.toBeNull();
    expect(held()).toBe(false);
  });

  it("offers an image provider for a generated thumbnail with Images Off or Provide", async () => {
    await mount();
    await userEvent.click(segment("article", "Provide"));
    await userEvent.type(screen.getByLabelText("Article text"), "Ready article.");
    await userEvent.click(segment("audio", "Off"));
    await userEvent.click(segment("images", "Off"));
    await userEvent.click(segment("thumbnail", "From prompt"));
    await pick("Thumbnail prompt", "Title card");
    await pick("Provider", "fal");
    await pick("Model", "fal-ai/flux-2");
    await userEvent.type(screen.getByLabelText("topic"), "Albania");
    await userEvent.type(screen.getByLabelText("Video title"), "Thumbnail run");
    expect(held()).toBe(false);
    await userEvent.click(segment("images", "Provide"));
    expect(screen.getByLabelText("Provider")).not.toBeNull();
    expect(screen.getByLabelText("Model")).not.toBeNull();
    expect(segment("video", "Off").getAttribute("aria-checked")).toBe("true");
    expect((segment("video", "Generate") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("the thumbnail's two generate modes", () => {
  it("asks for a prompt in both, and for the LLM row only when the LLM writes it", async () => {
    await mount();

    expect(screen.queryByLabelText("Thumbnail prompt")).toBeNull();

    await userEvent.click(segment("thumbnail", "From prompt"));
    expect(screen.getByLabelText("Thumbnail prompt")).not.toBeNull();
    await pick("Thumbnail prompt", "Title card");

    await fillGeneratedRun();
    await waitFor(() => {
      expect(held()).toBe(false);
    });

    await userEvent.click(segment("thumbnail", "Prompt by LLM"));
    // Still one prompt, and still admissible: the LLM row was already answered.
    expect((screen.getByLabelText("Thumbnail prompt") as HTMLSelectElement).value).toBe(
      "Title card",
    );
    await waitFor(() => {
      expect(held()).toBe(false);
    });
  });

  it("holds Play for the LLM row when the LLM writes the thumbnail prompt", async () => {
    await mount();

    await pick("Article prompt", "Dossier");
    await userEvent.click(segment("thumbnail", "Prompt by LLM"));
    await pick("Thumbnail prompt", "Title card");
    await userEvent.click(segment("article", "Provide"));

    // The article is provided now, so nothing but the thumbnail asks for an LLM.
    expect(screen.getByLabelText("LLM")).not.toBeNull();
  });
});

describe("the keyword block", () => {
  it("grows and shrinks with the prompts that are picked", async () => {
    await mount();

    expect(screen.queryByLabelText("topic")).toBeNull();

    await pick("Article prompt", "Dossier");
    expect(screen.getByLabelText("topic")).not.toBeNull();
    expect(screen.getByLabelText("minWords")).not.toBeNull();
    expect(screen.queryByLabelText("style")).toBeNull();

    await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
    expect(screen.getByLabelText("style")).not.toBeNull();
    // `topic` is on both sides now, so it moves from Text to Common.
    expect(
      document.querySelector('[data-keywords="common"]')?.contains(screen.getByLabelText("topic")),
    ).toBe(true);

    await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
    expect(screen.queryByLabelText("style")).toBeNull();
  });

  it("names the empty keyword in the hint and marks it in place", async () => {
    await mount();

    await fillGeneratedRun();
    await userEvent.clear(screen.getByLabelText("style"));

    expect(screen.getByText("Fill style to play")).not.toBeNull();
    expect(screen.getByLabelText("style").getAttribute("aria-invalid")).toBe("true");
    expect(held()).toBe(true);
  });
});

describe("a run the server refuses", () => {
  it("marks every field the 400 named and keeps the form", async () => {
    const created = await mount({
      "POST /api/projects": fieldsAnswer([
        { field: "articlePrompt", message: "That article prompt no longer exists; pick another." },
        { field: "values.topic", message: "This field is required." },
      ]),
    });

    await fillGeneratedRun();
    await waitFor(() => {
      expect(held()).toBe(false);
    });
    await userEvent.click(playKey());

    expect(
      await screen.findByText("That article prompt no longer exists; pick another."),
    ).not.toBeNull();
    expect(screen.getByText("This field is required.")).not.toBeNull();
    expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("topic").getAttribute("aria-invalid")).toBe("true");
    expect(created).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Video title") as HTMLInputElement).value).toBe("Rope Tricks");
  });

  it("clears the server's marks as soon as the form changes", async () => {
    await mount({
      "POST /api/projects": fieldsAnswer([
        { field: "values.topic", message: "This field is required." },
      ]),
    });

    await fillGeneratedRun();
    await waitFor(() => {
      expect(held()).toBe(false);
    });
    await userEvent.click(playKey());
    expect(await screen.findByText("This field is required.")).not.toBeNull();

    await userEvent.type(screen.getByLabelText("topic"), "s");
    expect(screen.queryByText("This field is required.")).toBeNull();
  });
});

describe("subtitles on Play", () => {
  const fonts = [{ id: "default", name: "Default", family: "Arial", source: "bundled" }];
  const mode = () =>
    screen.getByLabelText("Subtitles", { selector: "select" }) as HTMLSelectElement;

  it("converts burn-in to files when Video turns Off, then clears captions when Audio turns Off", async () => {
    await mount({ "GET /api/fonts": jsonAnswer({ fonts }) });
    await userEvent.selectOptions(mode(), "burn-in");
    await userEvent.click(segment("images", "Off"));
    expect(mode().value).toBe("files");
    await userEvent.click(segment("audio", "Off"));
    expect(mode().value).toBe("off");
    expect(mode().closest("fieldset")?.disabled).toBe(true);
    await userEvent.click(segment("audio", "Generate"));
    expect(mode().value).toBe("off");
  });

  it("blocks Play until an uploaded font is selected and sends the chosen subtitle settings", async () => {
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const custom = {
      id: "uploaded-font",
      name: "Uploaded",
      family: "Uploaded",
      source: "uploaded",
    };
    const create = vi.fn(async (request: Request) => {
      const body = await request.json();
      expect(body.subtitles).toEqual({
        mode: "burn-in",
        language: "en",
        fontId: "uploaded-font",
        fontSize: 64,
        position: "top",
      });
      return jsonAnswer({ project: { id: "p1", status: "running" }, stages: [] }, 201)(request);
    });
    await mount({
      "GET /api/fonts": jsonAnswer({ fonts: [...fonts, custom] }),
      "POST /api/fonts": () => pending,
      "POST /api/projects": create,
    });
    await fillGeneratedRun();
    expect(held()).toBe(false);
    await userEvent.selectOptions(mode(), "burn-in");
    await userEvent.upload(
      screen.getByLabelText("Upload font (.ttf or .otf)"),
      new File(["font"], "uploaded.ttf", { type: "font/ttf" }),
    );
    await screen.findByText("Uploading font…");
    expect(held()).toBe(true);
    const size = screen.getByLabelText("Subtitle font size");
    await userEvent.clear(size);
    await userEvent.type(size, "64");
    await userEvent.selectOptions(screen.getByLabelText("Subtitle position"), "top");
    release?.(
      new Response(JSON.stringify({ font: custom }), {
        headers: { "content-type": "application/json", "X-Slopify-Version": testVersion },
      }),
    );
    await waitFor(() => expect(held()).toBe(false));
    expect((screen.getByLabelText("Subtitle font") as HTMLSelectElement).value).toBe(
      "uploaded-font",
    );
    expect((size as HTMLInputElement).value).toBe("64");
    await userEvent.click(playKey());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it.each([
    { off: "subtitles", size: "" },
    { off: "subtitles", size: "150" },
    { off: "audio", size: "" },
    { off: "audio", size: "150" },
  ])(
    "can start after an invalid subtitle size is hidden by $off Off (size '$size')",
    async ({ off, size }) => {
      const created = await mount({
        "GET /api/fonts": jsonAnswer({ fonts }),
        "POST /api/projects": async (request) => {
          const draft = await request.json();
          expect(subtitleConfigSchema.parse(draft.subtitles)).toMatchObject({
            mode: "off",
            fontSize: 48,
          });
          return jsonAnswer({ project: { id: "p1", status: "running" }, stages: [] }, 201)(request);
        },
      });
      await fillGeneratedRun();
      await userEvent.selectOptions(mode(), "burn-in");
      await userEvent.clear(screen.getByLabelText("Subtitle font size"));
      if (size) await userEvent.type(screen.getByLabelText("Subtitle font size"), size);
      expect(held()).toBe(true);
      if (off === "audio") await userEvent.click(segment("audio", "Off"));
      else await userEvent.selectOptions(mode(), "off");
      expect(held()).toBe(false);
      expect(screen.queryByLabelText("Subtitle font size")).toBeNull();
      await userEvent.click(playKey());
      await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    },
  );

  it("shows a subtitle font refusal from the server at the subtitle controls", async () => {
    await mount({
      "GET /api/fonts": jsonAnswer({ fonts }),
      "POST /api/projects": fieldsAnswer([
        { field: "subtitles.fontId", message: "Choose an installed font." },
      ]),
    });
    await fillGeneratedRun();
    await userEvent.selectOptions(mode(), "files");
    await userEvent.click(playKey());
    await screen.findByText("Choose an installed font.");
  });
});

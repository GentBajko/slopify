import { subtitleConfigSchema } from "@app/slices/subtitles/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { entries, mountPlay } from "@/play/play-test-fixture";
import { type Answer, jsonAnswer, testVersion } from "@/test-app";

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

async function section(name: string): Promise<void> {
  await userEvent.click(
    within(screen.getByRole("navigation", { name: "Run setup" })).getByRole("button", { name }),
  );
}
async function openCosts(): Promise<void> {
  await section("Review");
  await userEvent.click(screen.getByRole("button", { name: "Review costs" }));
}

function held(): boolean {
  return tutorial.progress.mock.lastCall?.[0]?.playReady !== true;
}

async function pick(label: string, value: string): Promise<void> {
  await section(["Article prompt", "LLM", "Text model"].includes(label) ? "Content" : "Outputs");
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

async function mount(
  over: Readonly<Record<string, Answer>> = {},
): Promise<ReturnType<typeof vi.fn>> {
  return (await mountPlay(over)).created;
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
  await section("Outputs");
  await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
  await pick("LLM", "claude-code");
  await pick("Text model", "sonnet");
  await section("Content");
  await userEvent.type(screen.getByLabelText("Project title"), "Rope Tricks");
  await section("Content");
  await userEvent.type(screen.getByLabelText("topic"), "rope");
  await section("Content");
  await userEvent.type(screen.getByLabelText("minWords"), "3000");
  await section("Content");
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

    await openCosts();
    expect(created).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
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
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));

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
    expect(hint).not.toBeNull();
  });

  it("marks nothing on a form nobody has touched, and the named control once one is", async () => {
    await mount();

    expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("false");

    // Naming the run leaves the article prompt the first missing item, and now that the
    // user is configuring the run it is marked where it stands.
    await section("Content");
    await userEvent.type(screen.getByLabelText("Project title"), "Rope Tricks");

    expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("false");
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

    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith("p1");
    });
  });
});

describe("Ctrl+Enter", () => {
  it("does nothing while the run is not admissible", async () => {
    const created = await mount();

    await section("Content");
    await userEvent.click(screen.getByLabelText("Project title"));
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(created).not.toHaveBeenCalled();
  });

  it("presses Play once the run is admissible", async () => {
    const created = await mount();

    await fillGeneratedRun();
    await waitFor(() => {
      expect(held()).toBe(false);
    });

    await section("Content");
    await userEvent.click(screen.getByLabelText("Project title"));
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await userEvent.click(screen.getByRole("button", { name: "Review costs" }));
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));

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
    await section("Outputs");
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
    await section("Outputs");
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

    await section("Content");
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
      "PUT /api/drafts/:id/attachments/:attachmentId/file": (request) =>
        jsonAnswer({
          id: new URL(request.url).pathname.split("/")[5],
          kind: "audio",
          name: "narration.wav",
          bytes: 5,
          state: "ready",
          stagedFileId: "uploaded-narration",
          error: null,
        })(request),
      "POST /api/projects": posted,
    });
    await pick("Outro", "Sting");
    await section("Content");
    await userEvent.click(segment("article", "Provide"));
    await section("Content");
    await userEvent.type(screen.getByLabelText("Article text"), "The full article.");
    await section("Outputs");
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
    await section("Outputs");
    await userEvent.click(segment("images", "Off"));
    await section("Content");
    await userEvent.type(screen.getByLabelText("Project title"), "Uploaded audio");
    expect(held()).toBe(false);
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
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
    await section("Content");
    expect(screen.getByLabelText("unused")).not.toBeNull();
    await section("Content");
    await userEvent.click(segment("article", "Provide"));
    await section("Content");
    await userEvent.type(screen.getByLabelText("Article text"), "My finished article.");
    await section("Outputs");
    await userEvent.click(segment("audio", "Off"));
    await section("Outputs");
    await userEvent.click(segment("images", "Off"));
    expect(screen.queryByLabelText("Intro")).toBeNull();
    expect(screen.queryByLabelText("Outro")).toBeNull();
    expect(screen.queryByLabelText("unused")).toBeNull();
    expect(screen.queryByLabelText("LLM")).toBeNull();
    expect(segment("video", "Off").getAttribute("aria-checked")).toBe("true");
    expect((segment("video", "Generate") as HTMLButtonElement).disabled).toBe(true);
    await section("Content");
    await userEvent.type(screen.getByLabelText("Project title"), "Article only");
    expect(held()).toBe(false);
    expect(tutorial.progress.mock.lastCall?.[0]).toMatchObject({
      playAudioReady: true,
      playImagesReady: true,
      playVideoReady: true,
      playSubtitlesReady: true,
    });
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
    await waitFor(() => expect(created).toHaveBeenCalledWith("article-only"));
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it("keeps silent video available without a TTS provider or voice", async () => {
    await mount();
    await fillGeneratedRun();
    await section("Outputs");
    await userEvent.click(segment("audio", "Off"));
    expect(screen.getByText("Silent video · 5 seconds per image")).not.toBeNull();
    expect(screen.queryByLabelText("TTS")).toBeNull();
    expect(held()).toBe(false);
    await section("Outputs");
    await userEvent.click(segment("video", "Off"));
    expect(screen.getByText("Download each enabled stage separately")).not.toBeNull();
    await section("Outputs");
    await userEvent.click(segment("audio", "Generate"));
    expect(screen.getByText("Combined WAV export with narration and segment gaps")).not.toBeNull();
    expect(held()).toBe(false);
  });

  it("offers an image provider for a generated thumbnail with Images Off or Provide", async () => {
    await mount();
    await section("Content");
    await userEvent.click(segment("article", "Provide"));
    await section("Content");
    await userEvent.type(screen.getByLabelText("Article text"), "Ready article.");
    await section("Outputs");
    await userEvent.click(segment("audio", "Off"));
    await section("Outputs");
    await userEvent.click(segment("images", "Off"));
    await section("Outputs");
    await userEvent.click(segment("thumbnail", "From prompt"));
    await pick("Thumbnail prompt", "Title card");
    await pick("Provider", "fal");
    await pick("Model", "fal-ai/flux-2");
    await section("Content");
    await userEvent.type(screen.getByLabelText("topic"), "Albania");
    await section("Content");
    await userEvent.type(screen.getByLabelText("Project title"), "Thumbnail run");
    expect(held()).toBe(false);
    await section("Outputs");
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

    await section("Outputs");
    await userEvent.click(segment("thumbnail", "From prompt"));
    expect(screen.getByLabelText("Thumbnail prompt")).not.toBeNull();
    await pick("Thumbnail prompt", "Title card");

    await fillGeneratedRun();
    await waitFor(() => {
      expect(held()).toBe(false);
    });

    await section("Outputs");
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
    await section("Outputs");
    await userEvent.click(segment("thumbnail", "Prompt by LLM"));
    await pick("Thumbnail prompt", "Title card");
    await section("Content");
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

    await section("Outputs");
    await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
    await section("Content");
    expect(screen.getByLabelText("style")).not.toBeNull();
    expect(screen.getAllByLabelText("topic")).toHaveLength(1);

    await section("Outputs");
    await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
    await section("Content");
    expect(screen.queryByLabelText("style")).toBeNull();
  });

  it("names the empty keyword in the hint and marks it in place", async () => {
    await mount();

    await fillGeneratedRun();
    await section("Content");
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
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));

    expect(
      await screen.findByText("That article prompt no longer exists; pick another."),
    ).not.toBeNull();
    expect(screen.getByText("This field is required.")).not.toBeNull();
    await section("Content");
    expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("topic").getAttribute("aria-invalid")).toBe("true");
    expect(created).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Project title") as HTMLInputElement).value).toBe("Rope Tricks");
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
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
    expect(await screen.findByText("This field is required.")).not.toBeNull();

    await section("Content");
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
    await section("Style");
    await userEvent.selectOptions(mode(), "burn-in");
    await section("Outputs");
    await userEvent.click(segment("images", "Off"));
    await section("Style");
    expect(mode().value).toBe("files");
    await section("Outputs");
    await userEvent.click(segment("audio", "Off"));
    await section("Style");
    expect(mode().value).toBe("off");
    expect(mode().closest("fieldset")?.disabled).toBe(true);
    await section("Outputs");
    await userEvent.click(segment("audio", "Generate"));
    await section("Style");
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
    await section("Style");
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
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
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
      await section("Style");
      await userEvent.selectOptions(mode(), "burn-in");
      await userEvent.clear(screen.getByLabelText("Subtitle font size"));
      if (size) await userEvent.type(screen.getByLabelText("Subtitle font size"), size);
      expect(held()).toBe(true);
      if (off === "audio") {
        await section("Outputs");
        await userEvent.click(segment("audio", "Off"));
      } else await userEvent.selectOptions(mode(), "off");
      expect(held()).toBe(false);
      expect(screen.queryByLabelText("Subtitle font size")).toBeNull();
      await openCosts();
      await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
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
    await section("Style");
    await userEvent.selectOptions(mode(), "files");
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
    await screen.findByText("Choose an installed font.");
  });
});

describe("explicit review error navigation", () => {
  it("opens Audio Advanced and focuses its native chunking control", async () => {
    await mount({
      "POST /api/projects": fieldsAnswer([
        { field: "chunking.mode", message: "Review audio chunking." },
      ]),
    });
    await fillGeneratedRun();
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
    await userEvent.click(await screen.findByRole("button", { name: "Review audio chunking." }));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-play-field")).toBe("chunking.mode"),
    );
    expect(screen.getByText(/Audio Advanced/).closest("details")?.open).toBe(true);
  });
  it("keeps unknown failures visible and focuses the Review heading", async () => {
    await mount({
      "POST /api/projects": fieldsAnswer([
        { field: "future.rule", message: "A new rule requires attention." },
      ]),
    });
    await fillGeneratedRun();
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: "Start run" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "A new rule requires attention." }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Review" })),
    );
    expect(screen.getByRole("button", { name: "A new rule requires attention." })).not.toBeNull();
  });
  it("opens keyword variations and focuses the stable batch row field", async () => {
    await mount({
      "POST /api/projects/batch": fieldsAnswer([
        { field: "items.1.values.topic", message: "Complete the second video's topic." },
      ]),
    });
    await fillGeneratedRun();
    await section("Review");
    await userEvent.click(screen.getByText(/Queue keyword variations/));
    await userEvent.click(screen.getByRole("button", { name: "Add keyword variation" }));
    await userEvent.click(screen.getByRole("button", { name: "Review costs" }));
    await userEvent.click(await screen.findByRole("button", { name: "Queue 2 videos" }));
    await userEvent.click(screen.getByText(/Queue keyword variations/));
    await userEvent.click(
      await screen.findByRole("button", { name: "Complete the second video's topic." }),
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("topic")));
    expect(screen.getByText(/Queue keyword variations/).closest("details")?.open).toBe(true);
  });
});

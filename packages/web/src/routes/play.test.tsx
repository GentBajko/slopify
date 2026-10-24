import type { StageKind } from "@app/kernel/pipeline.js";
import type { StageSource } from "@app/slices/admission/model.js";
import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { subtitleConfigSchema } from "@app/slices/subtitles/model.js";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  entries,
  fill,
  generatedRun,
  makeKey,
  mountPlay,
  openRow,
  openSection,
  pickArticlePrompt,
  summaryTitle,
  topicLabel,
} from "@/play/play-test-fixture";
import { sourceLabel } from "@/play/state";
import { type Answer, jsonAnswer, testVersion } from "@/test-app";

const tutorial = vi.hoisted(() => ({
  event: vi.fn(),
  progress: vi.fn<(progress: Readonly<Record<string, boolean>>) => void>(),
}));

// The rail's style preview has its own tests; here it would only render in the background.
vi.mock("@/video/style-preview", () => ({ StylePreview: () => null }));

vi.mock("@/tutorial/context", () => ({
  useTutorial: () => undefined,
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
  await openSection(name);
}
async function openCosts(): Promise<void> {
  await section("Review");
  await waitFor(() =>
    expect((screen.getByRole("button", { name: makeKey }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
}

function held(): boolean {
  return tutorial.progress.mock.lastCall?.[0]?.playReady !== true;
}

// Opens only the row that holds the picker, so the rest of Play stays folded and each edit
// renders less.
const rowOfPicker: Readonly<Record<string, string>> = {
  "Article prompt": "Article",
  "Written by Service": "Article",
  "Written by Model": "Article",
  "Read by Service": "Narration",
  "Read by Model": "Narration",
  Voice: "Narration",
  Intro: "Narration",
  Outro: "Narration",
  "Images by Service": "Images",
  "Images by Model": "Images",
  "Thumbnail prompt": "Extras",
};
async function pick(label: string, value: string): Promise<void> {
  if (screen.queryByRole("dialog", { name: summaryTitle })) await section("Content");
  await openRow(rowOfPicker[label] ?? "Extras");
  if (label === "Article prompt") return pickArticlePrompt(value);
  return userEvent.selectOptions(screen.getByLabelText(label), value);
}

// One stage's switch, scoped to its own rail and named for its stage; the choices are asked
// for by what the rule calls them and found by the words the stage says them in. The
// thumbnail's None is its Outputs tick, which a choice of how to make it ticks first.
const stageNames: Readonly<Record<StageKind, string>> = {
  research: "Research",
  article: "Article",
  audio: "Narration",
  images: "Images",
  thumbnail: "Thumbnail",
  video: "Video",
  document: "PDF of the article",
};
function segment(stage: StageKind, source: StageSource | string): HTMLElement {
  const tick = screen.queryByRole("checkbox", { name: stageNames[stage] });
  if (tick instanceof HTMLInputElement && !tick.checked && source !== "off") fireEvent.click(tick);
  const words =
    stage === "article"
      ? source
      : stage === "video" && source === "off"
        ? /^Off/
        : sourceLabel(stage, source as StageSource);
  return within(screen.getByRole("radiogroup", { name: stageNames[stage] })).getByRole("radio", {
    name: words,
  });
}

function imageModel(): HTMLElement {
  return screen.getByLabelText(/^(Images|Drawn) by Model$/);
}

// Mounts Play on a fresh draft, or on `start` (a complete generated run is `generatedRun`).
async function mount(
  over: Readonly<Record<string, Answer>> = {},
  start?: PlayDraftDocument,
): Promise<ReturnType<typeof vi.fn>> {
  return (await mountPlay(over, start)).created;
}

// Fills the form by hand for a run whose every stage is generated, as a person would; the
// tests about what comes after start from `generatedRun` instead.
async function fillGeneratedRun(): Promise<void> {
  await pick("Article prompt", "Dossier");
  await pick("Read by Service", "elevenlabs");
  await pick("Read by Model", "eleven_multilingual_v2");
  await pick("Voice", "eleven-narrator");
  await pick("Images by Service", "fal");
  await userEvent.selectOptions(imageModel(), "fal-ai/flux-2");
  await userEvent.click(screen.getByRole("checkbox", { name: "Oils" }));
  await pick("Written by Service", "claude-code");
  await pick("Written by Model", "sonnet");
  await fill(screen.getByLabelText(topicLabel), "Rope Tricks");
  await openRow("Keywords");
  await fill(screen.getByLabelText("topic"), "rope");
  await fill(screen.getByLabelText("minWords"), "3000");
  await fill(screen.getByLabelText("style"), "oil on canvas");
}

// Review opens over the editor, so a message can show both in the drawer's error list and
// under the field behind it; these assertions read the drawer.
function reviewDrawer(): HTMLElement {
  return screen.getByRole("dialog", { name: summaryTitle });
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
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith("p1");
    });
    expect(tutorial.event).toHaveBeenCalledExactlyOnceWith({ type: "project-created", id: "p1" });
    const emittedAt = tutorial.event.mock.invocationCallOrder[0];
    const leftAt = vi.mocked(created).mock.invocationCallOrder[0];
    expect(emittedAt).toBeLessThan(leftAt ?? 0);
  });

  it("does not report a project when server admission refuses the run", async () => {
    await mount(
      {
        "POST /api/projects": fieldsAnswer([
          { field: "articlePrompt", message: "That article prompt was deleted." },
        ]),
      },
      generatedRun,
    );
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));

    await within(reviewDrawer()).findByText("That article prompt was deleted.");
    expect(tutorial.progress.mock.lastCall?.[0]?.playArticleReady).toBe(false);
    expect(tutorial.event).not.toHaveBeenCalled();
  });
});

describe("the Make button and its hint", () => {
  it("is held on a fresh form and names the first missing item, top to bottom", async () => {
    await mount();

    expect(held()).toBe(true);
    // The topic is the first thing on the page, so it is the first thing asked for.
    const hint = screen.getByRole("button", { name: "Type what the video is about first" });
    // The hint is announced with the button rather than only sitting beside it.
    const key = screen.getByRole("button", { name: makeKey });
    expect(key.getAttribute("aria-describedby")).toBe(hint.parentElement?.id);
    await fill(screen.getByLabelText(topicLabel), "Rope Tricks");
    expect(screen.getByText("Pick an article prompt first")).not.toBeNull();
  });

  it("marks nothing on a form nobody has touched, and the named control once one is", async () => {
    await mount();

    expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("false");

    // Naming the run leaves the article prompt the first missing item, and now that the
    // user is configuring the run it is marked where it stands.
    await section("Content");
    await fill(screen.getByLabelText(topicLabel), "Rope Tricks");

    expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("false");
  });

  it("moves the hint to the next missing item as the form fills", async () => {
    await mount();

    await fill(screen.getByLabelText(topicLabel), "Rope Tricks");
    await pick("Article prompt", "Dossier");
    // The rows are read top to bottom: the keywords the prompt asks for come first, then the
    // writer in the Article row, under its prompt.
    expect(screen.getByText("Fill in topic first")).not.toBeNull();
    await openRow("Keywords");
    await fill(screen.getByLabelText("topic"), "rope");
    await fill(screen.getByLabelText("minWords"), "3000");
    expect(screen.getByText("Pick a service and model to write the text first")).not.toBeNull();

    await pick("Written by Service", "claude-code");
    await pick("Written by Model", "sonnet");
    expect(screen.getByText("Pick a voice service first")).not.toBeNull();

    await pick("Read by Service", "elevenlabs");
    await pick("Read by Model", "eleven_multilingual_v2");
    expect(screen.getByText("Pick a voice first")).not.toBeNull();

    await pick("Voice", "eleven-narrator");
    expect(screen.getByText("Tick an image prompt first")).not.toBeNull();
  });

  it("comes alive once every rail and the cue sheet are answered", async () => {
    const created = await mount();

    await fillGeneratedRun();

    await waitFor(() => {
      expect(held()).toBe(false);
    });
    expect(screen.queryByText(/ first$/)).toBeNull();

    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));
    await waitFor(() => {
      expect(created).toHaveBeenCalledWith("p1");
    });
  });
});

describe("Ctrl+Enter", () => {
  it("does nothing while the run is not admissible", async () => {
    const created = await mount();

    await section("Content");
    await userEvent.click(screen.getByLabelText(topicLabel));
    await userEvent.keyboard("{Control>}{Enter}{/Control}");

    expect(created).not.toHaveBeenCalled();
  });

  it("presses Play once the run is admissible", async () => {
    const created = await mount({}, generatedRun);

    await waitFor(() => {
      expect(held()).toBe(false);
    });

    await section("Content");
    await userEvent.click(screen.getByLabelText(topicLabel));
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() =>
      expect((screen.getByRole("button", { name: makeKey }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));

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

    expect(unkeyed.textContent).toBe("OpenRouter · No key");
    expect(absent.textContent).toBe("Codex CLI · Not found");
    expect(cartesia.textContent).toBe("Cartesia · No key");
    expect(screen.getByRole("option", { name: "ElevenLabs" }).textContent).toBe("ElevenLabs");
  });

  it("offers only the voices of the picked narration provider", async () => {
    await mount();

    await pick("Read by Service", "elevenlabs");
    await pick("Read by Model", "eleven_multilingual_v2");
    expect(screen.getByRole("option", { name: "Narrator M" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: "Other" })).toBeNull();
  });
});

describe("the source switches", () => {
  it("offers each stage only the sources the rule allows it", async () => {
    await mount();

    // Each stage says its choices in its own words, and the paid one says that it is paid.
    expect(screen.getByRole("radiogroup", { name: "Research" }).textContent).toBe(
      "OffLet the AI researchPaste my notes",
    );
    // The article's source is said as the task: write it, read the person's text as written,
    // or adapt that text with the article prompt.
    expect(screen.getByRole("radiogroup", { name: "Article" }).textContent).toBe(
      "Write it for meUse my text as writtenAdapt my textNo text",
    );
    await section("Outputs");
    expect(screen.getByRole("radiogroup", { name: "Narration" }).textContent).toBe(
      "OffAI voice (paid per character)My own audio file",
    );
    expect(screen.getByRole("radiogroup", { name: "Images" }).textContent).toBe(
      "NoneMade by AI (paid)My own images",
    );
    expect(screen.getByRole("radiogroup", { name: "Video" }).textContent).toBe(
      "Off (sound only)Make the video",
    );
    // The thumbnail and the PDF are ticks; ticked, the thumbnail says how it is made.
    expect(screen.queryByRole("radiogroup", { name: "Thumbnail" })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Thumbnail" }));
    expect(screen.getByRole("radiogroup", { name: "Thumbnail" }).textContent).toBe(
      "From my thumbnail promptLet the AI write the promptUpload mine",
    );
    expect(screen.getByRole("checkbox", { name: "PDF of the article" })).not.toBeNull();
  });

  it("swaps a stage's controls for its paste area, and hides research behind a provided article", async () => {
    await mount();

    expect(screen.getByLabelText("Article prompt")).not.toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Research" })).not.toBeNull();

    await section("Content");
    await userEvent.click(segment("article", "Use my text as written"));

    expect(screen.queryByLabelText("Article prompt")).toBeNull();
    expect(screen.getByLabelText("Article text")).not.toBeNull();
    // Research only feeds article writing.
    expect(screen.queryByRole("radiogroup", { name: "Research" })).toBeNull();
  });

  it("takes away what reads the article when the article is Off", async () => {
    await mount();
    await section("Content");
    await userEvent.click(segment("article", "No text"));

    expect(screen.queryByRole("radiogroup", { name: "Research" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Narration" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "PDF of the article" })).toBeNull();
    await section("Outputs");
    await userEvent.click(screen.getByRole("checkbox", { name: "Thumbnail" }));
    expect(screen.getByRole("radiogroup", { name: "Thumbnail" }).textContent).toBe(
      "From my thumbnail promptUpload mine",
    );
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
    await userEvent.click(segment("article", "Use my text as written"));
    await section("Content");
    await fill(screen.getByLabelText("Article text"), "The full article.");
    await section("Outputs");
    await userEvent.click(segment("audio", "provide"));
    expect(screen.queryByLabelText("Intro")).toBeNull();
    expect(screen.queryByLabelText("Outro")).toBeNull();
    expect(screen.queryByLabelText("unused")).toBeNull();
    expect(screen.queryByLabelText("Written by Service")).toBeNull();
    expect(
      screen.getByText("Your file is used as it is; include any intro and outro in it."),
    ).not.toBeNull();
    await userEvent.upload(
      screen.getByLabelText("Narration file"),
      new File(["audio"], "narration.wav", { type: "audio/wav" }),
    );
    await screen.findByText("Staged");
    await section("Outputs");
    await userEvent.click(segment("images", "off"));
    await section("Content");
    await fill(screen.getByLabelText(topicLabel), "Uploaded audio");
    expect(held()).toBe(false);
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));
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
    await userEvent.click(segment("article", "Use my text as written"));
    await section("Content");
    await fill(screen.getByLabelText("Article text"), "My finished article.");
    await section("Outputs");
    await userEvent.click(segment("audio", "off"));
    await section("Outputs");
    await userEvent.click(segment("images", "off"));
    expect(screen.queryByLabelText("Intro")).toBeNull();
    expect(screen.queryByLabelText("Outro")).toBeNull();
    expect(screen.queryByLabelText("unused")).toBeNull();
    expect(screen.queryByLabelText("Written by Service")).toBeNull();
    expect(segment("video", "off").getAttribute("aria-checked")).toBe("true");
    expect((segment("video", "generate") as HTMLButtonElement).disabled).toBe(true);
    await section("Content");
    await fill(screen.getByLabelText(topicLabel), "Article only");
    expect(held()).toBe(false);
    expect(tutorial.progress.mock.lastCall?.[0]).toMatchObject({
      playAudioReady: true,
      playImagesReady: true,
      playVideoReady: true,
      playSubtitlesReady: true,
    });
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));
    await waitFor(() => expect(created).toHaveBeenCalledWith("article-only"));
    expect(posted).toHaveBeenCalledTimes(1);
  });

  it("keeps silent video available without a TTS provider or voice", async () => {
    await mount({}, generatedRun);
    await section("Outputs");
    await userEvent.click(segment("audio", "off"));
    expect(screen.getByText(/^A silent video, each image shown once/)).not.toBeNull();
    expect(screen.queryByLabelText("Read by Service")).toBeNull();
    expect(held()).toBe(false);
    await section("Outputs");
    await userEvent.click(segment("video", "off"));
    expect(screen.getByText("Each finished stage downloads on its own.")).not.toBeNull();
    await section("Outputs");
    await userEvent.click(segment("audio", "generate"));
    expect(screen.getByText("Sound only: the narration as one audio file.")).not.toBeNull();
    expect(held()).toBe(false);
  });

  it("offers an image provider for a generated thumbnail with Images Off or Provide", async () => {
    await mount();
    await section("Content");
    await userEvent.click(segment("article", "Use my text as written"));
    await section("Content");
    await fill(screen.getByLabelText("Article text"), "Ready article.");
    await section("Outputs");
    await userEvent.click(segment("audio", "off"));
    await section("Outputs");
    await userEvent.click(segment("images", "off"));
    await section("Outputs");
    await userEvent.click(segment("thumbnail", "from_prompt"));
    await pick("Thumbnail prompt", "Title card");
    await userEvent.selectOptions(screen.getByLabelText("Drawn by Service"), "fal");
    await userEvent.selectOptions(imageModel(), "fal-ai/flux-2");
    await section("Content");
    await fill(screen.getByLabelText("topic"), "Albania");
    await section("Content");
    await fill(screen.getByLabelText(topicLabel), "Thumbnail run");
    expect(held()).toBe(false);
    await section("Outputs");
    await userEvent.click(segment("images", "provide"));
    expect(screen.getByLabelText("Drawn by Service")).not.toBeNull();
    expect(imageModel()).not.toBeNull();
    expect(segment("video", "off").getAttribute("aria-checked")).toBe("true");
    expect((segment("video", "generate") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("the thumbnail's two generate modes", () => {
  it("asks for a prompt in both, and for the LLM row only when the LLM writes it", async () => {
    await mount({}, generatedRun);

    expect(screen.queryByLabelText("Thumbnail prompt")).toBeNull();

    await section("Outputs");
    await userEvent.click(segment("thumbnail", "from_prompt"));
    expect(screen.getByLabelText("Thumbnail prompt")).not.toBeNull();
    await pick("Thumbnail prompt", "Title card");

    await waitFor(() => {
      expect(held()).toBe(false);
    });

    await section("Outputs");
    await userEvent.click(segment("thumbnail", "prompt_by_llm"));
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
    await userEvent.click(segment("thumbnail", "prompt_by_llm"));
    await pick("Thumbnail prompt", "Title card");
    await section("Content");
    await userEvent.click(segment("article", "Use my text as written"));

    // The article is provided now, so nothing but the thumbnail asks for an LLM.
    expect(screen.getByLabelText("Written by Service")).not.toBeNull();
  });
});

describe("the keyword block", () => {
  it("grows and shrinks with the prompts that are picked", async () => {
    await mount();

    expect(screen.queryByLabelText("topic")).toBeNull();

    await pick("Article prompt", "Dossier");
    await openRow("Keywords");
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
    await mount({}, generatedRun);

    await section("Content");
    await userEvent.clear(screen.getByLabelText("style"));
    // Leaving the field marks it; the rows stay open, so nothing else takes focus first.
    await userEvent.tab();

    expect(screen.getByText("Fill in style first")).not.toBeNull();
    expect(screen.getByLabelText("style").getAttribute("aria-invalid")).toBe("true");
    expect(held()).toBe(true);
  });
});

describe("a run the server refuses", () => {
  it("marks every field the 400 named and keeps the form", async () => {
    const created = await mount(
      {
        "POST /api/projects": fieldsAnswer([
          {
            field: "articlePrompt",
            message: "That article prompt no longer exists; pick another.",
          },
          { field: "values.topic", message: "This field is required." },
        ]),
      },
      generatedRun,
    );

    await waitFor(() => {
      expect(held()).toBe(false);
    });
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));

    expect(
      await within(reviewDrawer()).findByText(
        "That article prompt no longer exists; pick another.",
      ),
    ).not.toBeNull();
    expect(within(reviewDrawer()).getByText("This field is required.")).not.toBeNull();
    await section("Content");
    expect(screen.getByLabelText("Article prompt").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("topic").getAttribute("aria-invalid")).toBe("true");
    expect(created).not.toHaveBeenCalled();
    expect((screen.getByLabelText(topicLabel) as HTMLInputElement).value).toBe("Rope Tricks");
  });

  it("clears the server's marks as soon as the form changes", async () => {
    await mount(
      {
        "POST /api/projects": fieldsAnswer([
          { field: "values.topic", message: "This field is required." },
        ]),
      },
      generatedRun,
    );

    await waitFor(() => {
      expect(held()).toBe(false);
    });
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));
    expect(await within(reviewDrawer()).findByText("This field is required.")).not.toBeNull();

    await section("Content");
    await userEvent.type(screen.getByLabelText("topic"), "s");
    expect(screen.queryByText("This field is required.")).toBeNull();
  });
});

describe("subtitles on Play", () => {
  const fonts = [{ id: "default", name: "Default", family: "Arial", source: "bundled" }];
  const mode = () => screen.getByLabelText("Captions", { selector: "select" }) as HTMLSelectElement;

  it("converts burn-in to files when Video turns Off, then clears captions when Audio turns Off", async () => {
    await mount({ "GET /api/fonts": jsonAnswer({ fonts }) });
    await section("Style");
    await userEvent.selectOptions(mode(), "burn-in");
    await section("Outputs");
    await userEvent.click(segment("images", "off"));
    await section("Style");
    expect(mode().value).toBe("files");
    await section("Outputs");
    await userEvent.click(segment("audio", "off"));
    await section("Style");
    // With nothing to time them from, captions are not asked about at all.
    expect(screen.queryByLabelText("Captions", { selector: "select" })).toBeNull();
    await section("Outputs");
    await userEvent.click(segment("audio", "generate"));
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
    await mount(
      {
        "GET /api/fonts": jsonAnswer({ fonts: [...fonts, custom] }),
        "POST /api/fonts": () => pending,
        "POST /api/projects": create,
      },
      generatedRun,
    );
    expect(held()).toBe(false);
    await section("Style");
    await userEvent.selectOptions(mode(), "burn-in");
    await userEvent.upload(
      screen.getByLabelText("Upload font (.ttf or .otf)"),
      new File(["font"], "uploaded.ttf", { type: "font/ttf" }),
    );
    await screen.findByText("Uploading font…");
    expect(held()).toBe(true);
    const size = screen.getByLabelText("Caption size");
    await userEvent.clear(size);
    await userEvent.type(size, "64");
    await userEvent.click(screen.getByRole("radio", { name: "top" }));
    release?.(
      new Response(JSON.stringify({ font: custom }), {
        headers: { "content-type": "application/json", "X-Slopify-Version": testVersion },
      }),
    );
    await waitFor(() => expect(held()).toBe(false));
    expect((screen.getByLabelText("Caption font") as HTMLSelectElement).value).toBe(
      "uploaded-font",
    );
    expect((size as HTMLInputElement).value).toBe("64");
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));
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
      const created = await mount(
        {
          "GET /api/fonts": jsonAnswer({ fonts }),
          "POST /api/projects": async (request) => {
            const draft = await request.json();
            expect(subtitleConfigSchema.parse(draft.subtitles)).toMatchObject({
              mode: "off",
              fontSize: 48,
            });
            return jsonAnswer(
              { project: { id: "p1", status: "running" }, stages: [] },
              201,
            )(request);
          },
        },
        generatedRun,
      );
      await section("Style");
      await userEvent.selectOptions(mode(), "burn-in");
      await userEvent.clear(screen.getByLabelText("Caption size"));
      if (size) await userEvent.type(screen.getByLabelText("Caption size"), size);
      expect(held()).toBe(true);
      if (off === "audio") {
        await section("Outputs");
        await userEvent.click(segment("audio", "off"));
      } else await userEvent.selectOptions(mode(), "off");
      expect(held()).toBe(false);
      expect(screen.queryByLabelText("Caption size")).toBeNull();
      await openCosts();
      await userEvent.click(await screen.findByRole("button", { name: makeKey }));
      await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    },
  );

  it("shows a subtitle font refusal from the server at the subtitle controls", async () => {
    await mount(
      {
        "GET /api/fonts": jsonAnswer({ fonts }),
        "POST /api/projects": fieldsAnswer([
          { field: "subtitles.fontId", message: "Choose an installed font." },
        ]),
      },
      generatedRun,
    );
    await section("Style");
    await userEvent.selectOptions(mode(), "files");
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));
    await within(reviewDrawer()).findByText("Choose an installed font.");
  });
});

describe("explicit review error navigation", () => {
  it("opens More narration settings and focuses its native chunking control", async () => {
    await mount(
      {
        "POST /api/projects": fieldsAnswer([
          { field: "chunking.mode", message: "Review audio chunking." },
        ]),
      },
      generatedRun,
    );
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));
    await userEvent.click(
      await within(reviewDrawer()).findByRole("button", { name: /Review audio chunking\./ }),
    );
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("data-play-field")).toBe("chunking.mode"),
    );
    expect(screen.getByText("More narration settings").closest("details")?.open).toBe(true);
  });
  it("keeps unknown failures visible and focuses the summary's heading", async () => {
    await mount(
      {
        "POST /api/projects": fieldsAnswer([
          { field: "future.rule", message: "A new rule requires attention." },
        ]),
      },
      generatedRun,
    );
    await openCosts();
    await userEvent.click(await screen.findByRole("button", { name: makeKey }));
    await userEvent.click(
      await within(reviewDrawer()).findByRole("button", {
        name: /A new rule requires attention\./,
      }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: summaryTitle })),
    );
    expect(
      within(reviewDrawer()).getByRole("button", { name: /A new rule requires attention\./ }),
    ).not.toBeNull();
  });
  it("opens the other video's keywords and focuses its refused field", async () => {
    await mount(
      {
        "POST /api/projects/batch": fieldsAnswer([
          { field: "items.1.values.topic", message: "Complete the second video's topic." },
        ]),
      },
      generatedRun,
    );
    await userEvent.click(screen.getByRole("button", { name: "Another topic" }));
    await userEvent.type(screen.getByLabelText("Title of another video"), "Knot Tricks{Enter}");
    // The setup is checked again by itself once typing pauses.
    await waitFor(() =>
      expect((screen.getByRole("button", { name: makeKey }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Queue 2 videos" }));
    // The hint under the button is the refusal, and it goes to the field.
    await userEvent.click(
      await within(screen.getByRole("region", { name: "Start" })).findByRole("button", {
        name: "Complete the second video's topic.",
      }),
    );
    const panel = await screen.findByRole("dialog", { name: "Video 2: Knot Tricks" });
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByLabelText("topic")));
  });
});

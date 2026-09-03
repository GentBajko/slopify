import type { Entry, Prompt } from "@app/slices/library/model.js";
import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Answer, jsonAnswer, renderApp, testDeps, testVersion } from "@/test-app";
import { PlayForm } from "./play.js";

afterEach(cleanup);

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

describe("the Play key and its hint", () => {
  it("is held on a fresh form and names the first missing item", async () => {
    await mount();

    expect(held()).toBe(true);
    expect(screen.getByText("Pick an article prompt to play")).not.toBeNull();
    // The reason is announced with the key rather than only sitting beside it.
    const hint = screen.getByText("Pick an article prompt to play");
    expect(playKey().getAttribute("aria-describedby")).toBe(hint.id);
  });

  it("moves the hint to the next missing item as the form fills", async () => {
    await mount();

    await pick("Article prompt", "Dossier");
    expect(screen.getByText("Pick a narration provider to play")).not.toBeNull();

    await pick("TTS", "elevenlabs");
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
    // `logic/01` step 5: the video is always generated, so it carries no switch at all.
    expect(screen.queryByRole("radiogroup", { name: "video source" })).toBeNull();
  });

  it("swaps a stage's controls for its paste area, and hides research behind a provided article", async () => {
    await mount();

    expect(screen.getByLabelText("Article prompt")).not.toBeNull();
    expect(screen.getByRole("radiogroup", { name: "research source" })).not.toBeNull();

    await userEvent.click(segment("article", "Provide"));

    expect(screen.queryByLabelText("Article prompt")).toBeNull();
    expect(screen.getByLabelText("Article text")).not.toBeNull();
    // `logic/05` §Q41: research only feeds article writing.
    expect(screen.queryByRole("radiogroup", { name: "research source" })).toBeNull();
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

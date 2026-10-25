import type { FieldError } from "@app/slices/admission/rules.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { describe, expect, it } from "vitest";
import { readinessProblems, setupProblems } from "./problems";
import { freshForm, type PlayFormState } from "./state";

const form: PlayFormState = {
  ...freshForm,
  llm: { provider: "codex", model: "gpt" },
  audio: { ...freshForm.audio, provider: "openai-tts", model: "tts", voice: "sage" },
  images: { provider: "fal", model: "flux" },
};
const providers: readonly ProviderStatus[] = [
  {
    id: "codex",
    family: "llm",
    displayName: "Codex CLI",
    readiness: { kind: "cli", installed: false },
  },
  {
    id: "openai-tts",
    family: "tts",
    displayName: "OpenAI",
    readiness: { kind: "keyed", hasKey: false },
  },
  { id: "fal", family: "image", displayName: "fal.ai", readiness: { kind: "keyed", hasKey: true } },
];

describe("the services a setup calls that will not answer", () => {
  it("names each one on its row, with the fix and the way out", () => {
    expect(readinessProblems(form, [], providers, "article")).toEqual([
      {
        row: "article",
        field: "llm.provider",
        text: "Codex CLI isn't installed on this computer: set it up, or pick another writing service.",
        hint: "Set up Codex CLI first",
      },
      {
        row: "narration",
        field: "audio.provider",
        text: "OpenAI has no key yet: add one in Settings, or pick another voice service.",
        hint: "Add an OpenAI key first",
      },
    ]);
  });

  it("says what the computer's own voice lacks in a sentence, leaving the commands to the row", () => {
    const system: ProviderStatus = {
      id: "system-voice",
      family: "tts",
      displayName: "System voice",
      readiness: {
        kind: "local",
        available: false,
        issue:
          "No speech program was found on this computer, so the system voice can't narrate. Install espeak-ng (for example sudo apt install espeak-ng), or add an OpenAI key.",
      },
    };
    const local = { ...form, audio: { ...form.audio, provider: "system-voice" } };
    expect(
      readinessProblems(local, [], [...providers, system], "article").find(
        (one) => one.row === "narration",
      ),
    ).toEqual({
      row: "narration",
      field: "audio.provider",
      text: "No speech program was found on this computer, so the system voice can't narrate: install one, or pick another voice service.",
      hint: "Install a speech program first",
    });
  });

  it("says nothing of a service nobody picked, one the list does not know, or one not used", () => {
    const quiet = {
      ...form,
      llm: { provider: "", model: "" },
      audio: { ...form.audio, provider: "elsewhere" },
    };
    expect(readinessProblems(quiet, [], providers, "article")).toEqual([]);
    const silent = { ...form, sources: { ...form.sources, audio: "off" as const } };
    expect(readinessProblems(silent, [], providers, "article").map((one) => one.row)).toEqual([
      "article",
    ]);
  });
});

describe("one list of what stops the Make button", () => {
  const error = (field: string, message = `${field} is missing.`): FieldError => ({
    field,
    message,
  });

  it("puts the topic first, then one problem per row, top to bottom", () => {
    const errors = [error("images"), error("audio"), error("articlePrompt"), error("title")];
    const problems = setupProblems({
      form: {
        ...form,
        title: "",
        audio: { ...form.audio, provider: "", model: "" },
        images: { provider: "", model: "" },
      },
      errors,
      refused: [],
      topics: [],
      llmRow: "article",
    });
    expect(problems.map((one) => [one.row, one.hint])).toEqual([
      ["topic", "Type what the video is about first"],
      ["article", "Pick an article prompt first"],
      ["narration", "Pick a voice service first"],
      ["images", "Pick an image service and model first"],
    ]);
    // The row says the same thing to do, without "first".
    expect(problems[1]?.text).toBe("Pick an article prompt");
  });

  it("names what is missing of a picked service, and the way out when none of its kind answers", () => {
    const picked = setupProblems({
      form: { ...form, audio: { ...form.audio, model: "" }, images: { provider: "", model: "" } },
      errors: [error("audio"), error("images")],
      refused: [],
      topics: [],
      llmRow: "article",
      // No image service has a key here.
      providers: providers.map((one) =>
        one.family === "image"
          ? { ...one, readiness: { kind: "keyed" as const, hasKey: false } }
          : one,
      ),
    });
    expect(picked.map((one) => [one.text, one.hint])).toEqual([
      ["Pick a voice model", "Pick a voice model first"],
      [
        "No image service has a key yet: add one in Settings, or set Images to None.",
        "Add an image service key first",
      ],
    ]);
  });

  it("asks for every speaker's voice without naming a starter speaker", () => {
    const problems = setupProblems({
      form,
      errors: [error("voices.speakers.0.voice", "Choose a voice service and model for Alex.")],
      refused: [],
      topics: [],
      llmRow: "article",
    });
    expect(problems.map((one) => [one.text, one.hint])).toEqual([
      ["Pick a voice for each speaker", "Pick a voice for each speaker first"],
    ]);
  });

  it("keeps what the server refused in its own words, ahead of the form's rule on that row", () => {
    const refusal = error("articlePrompt", "That article prompt was deleted.");
    const problems = setupProblems({
      form,
      errors: [error("llm"), refusal],
      refused: [refusal],
      topics: [],
      llmRow: "article",
    });
    expect(problems).toEqual([
      {
        row: "article",
        field: "articlePrompt",
        text: "That article prompt was deleted.",
        hint: "That article prompt was deleted.",
      },
    ]);
  });

  it("puts an upload still copying before everything, and a rule no row holds after the rows", () => {
    const problems = setupProblems({
      form: { ...form, audio: { ...form.audio, provider: "", model: "" } },
      errors: [error("future.rule", "A new rule requires attention."), error("audio")],
      refused: [],
      topics: [],
      llmRow: "article",
      blocker: { field: "provided", hint: "Wait for the uploads to finish first" },
      readinessFirst: [],
    });
    expect(problems.map((one) => one.hint)).toEqual([
      "Wait for the uploads to finish first",
      "Pick a voice service first",
      "A new rule requires attention.",
    ]);
  });

  it("counts a service with no key on its row before the row's other problems", () => {
    const readiness = readinessProblems(form, [], providers, "article");
    const problems = setupProblems({
      form,
      errors: [error("audio.voice")],
      refused: [],
      topics: [],
      llmRow: "article",
      readinessFirst: readiness,
    });
    expect(problems.map((one) => [one.row, one.hint])).toEqual([
      ["article", "Set up Codex CLI first"],
      ["narration", "Add an OpenAI key first"],
    ]);
  });
});

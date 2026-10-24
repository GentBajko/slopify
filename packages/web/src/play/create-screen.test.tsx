import type { DraftView, PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultChannelId } from "@/channels/api";
import { type Answer, jsonAnswer, testVersion } from "@/test-app";
import { freshDraftDocument, setFreshProviderDefaults, setReadyServices } from "./draft-state";
import {
  draftView,
  generatedRun,
  makeKey,
  mountPlay,
  openSection,
  summaryTitle,
  topicLabel,
} from "./play-test-fixture";
import { reviewStorage } from "./review-test-harness";

// Create as one screen: what it says is missing, where, and how often; what it starts from;
// what the draft is called; how long the video is; and which channel it is for.

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() });
  Object.defineProperty(window, "sessionStorage", { configurable: true, value: reviewStorage() });
});
afterEach(() => {
  cleanup();
  setFreshProviderDefaults({});
  setReadyServices({});
});

const templateId = "33333333-3333-4333-8333-333333333333";
const providers = (voiceKey: boolean) =>
  jsonAnswer({
    providers: [
      {
        id: "claude-code",
        family: "llm",
        displayName: "Claude Code CLI",
        readiness: { kind: "cli", installed: true, version: "2.1.258" },
      },
      {
        id: "elevenlabs",
        family: "tts",
        displayName: "ElevenLabs",
        readiness: { kind: "keyed", hasKey: voiceKey },
      },
      {
        id: "fal",
        family: "image",
        displayName: "fal.ai",
        readiness: { kind: "keyed", hasKey: true },
      },
    ],
  });

// A starter template as the server saves it: its prompts and voice, no writer or image service.
const starter: PlayDraftDocument = {
  ...generatedRun,
  form: {
    ...generatedRun.form,
    title: "Lore: {{topic}}",
    llm: { provider: "", model: "" },
    images: { provider: "", model: "" },
    values: { minWords: "1500", style: "oil" },
  },
};
function starterRoutes(): Readonly<Record<string, Answer>> {
  const made = new Map<string, DraftView>();
  return {
    "GET /api/project-templates": jsonAnswer({
      templates: [
        { id: templateId, name: "Lore starter", version: 1, updatedAt: "2026-09-13T00:00:00.000Z" },
      ],
    }),
    "GET /api/onboarding": jsonAnswer({
      packs: [{ id: "lore", name: "Lore", summary: "", installed: true, templateId }],
    }),
    "GET /api/providers/first-run": jsonAnswer({
      firstRun: false,
      detected: [],
      defaults: {
        llm: { provider: "claude-code", model: "sonnet" },
        images: { provider: "fal", model: "fal-ai/flux-2" },
      },
      message: null,
      detail: null,
    }),
    [`POST /api/project-templates/${templateId}/instantiate`]: async (request) => {
      const { id } = (await request.json()) as { id: string };
      const view: DraftView = {
        ...draftView(id),
        draft: {
          ...draftView(id).draft,
          // In the template's channel, as the server makes it.
          document: {
            ...starter,
            channelId: defaultChannelId,
            templateSource: { id: templateId, version: 1 },
          },
        },
      };
      made.set(id, view);
      return jsonAnswer(view, 201)(request);
    },
    "GET /api/drafts/:id": (request) => {
      const id = new URL(request.url).pathname.split("/")[3] ?? "";
      return jsonAnswer(made.get(id) ?? draftView(id))(request);
    },
  };
}

const startFrom = () => screen.getByLabelText("Start from") as HTMLSelectElement;
// Create on a fresh draft that the starter template is about to replace: ready once the
// template list is there, not once a row is open.
const mountStarter = (over: Readonly<Record<string, Answer>> = {}) =>
  mountPlay({ ...starterRoutes(), ...over }, undefined, () =>
    screen.findByRole("option", { name: "Lore starter" }),
  );

describe("what is missing, said once and the same everywhere", () => {
  it("counts a picked voice service with no key on its row, in the hint and in the summary", async () => {
    await mountPlay({ "GET /api/providers": providers(false) }, generatedRun);
    const row = await waitFor(() => {
      const line = document.querySelector('[data-setup-row="narration"] [data-row-problem]');
      if (line === null) throw new Error("The Narration row says nothing is missing.");
      return line;
    });
    expect(row.textContent).toBe(
      "ElevenLabs has no key yet: add one in Settings, or pick another voice service.",
    );
    const rows = within(screen.getByRole("list", { name: "Setup" }));
    expect(rows.getAllByRole("button", { name: /^Fix / }).map((one) => one.textContent)).toEqual([
      "Fix",
    ]);
    const start = within(screen.getByRole("region", { name: "Start" }));
    expect((start.getByRole("button", { name: makeKey }) as HTMLButtonElement).disabled).toBe(true);
    expect(start.getByRole("button", { name: "Add an ElevenLabs key first" })).not.toBeNull();
    await openSection("Review");
    const missing = within(screen.getByRole("list", { name: "What is missing" }));
    expect(missing.getAllByRole("listitem").map((one) => one.textContent)).toEqual([
      "Narration: ElevenLabs has no key yet: add one in Settings, or pick another voice service.",
    ]);
  });

  it("keeps the topic field quiet until it is touched, even when the server's check refuses it", async () => {
    const { requests } = await mountPlay(
      {
        "POST /api/drafts/:id/review": () =>
          new Response(
            JSON.stringify({
              title: "Bad Request",
              status: 400,
              detail: "This run cannot start yet.",
              fields: [{ field: "title", message: "Fill in this field." }],
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/problem+json",
                "X-Slopify-Version": testVersion,
              },
            },
          ),
      },
      { ...generatedRun, form: { ...generatedRun.form, title: "" } },
    );
    // Coming back to the window asks the server, which refuses the empty title.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(requests.some((one) => one.url.endsWith("/review"))).toBe(true));
    await waitFor(() =>
      expect(screen.getByLabelText(topicLabel).getAttribute("aria-invalid")).toBe("false"),
    );
    expect(screen.queryByText("Fill in this field.")).toBeNull();
    // The hint says what to do, in the form's words, not the server's bare sentence.
    expect(
      within(screen.getByRole("region", { name: "Start" })).getByRole("button", {
        name: "Type what the video is about first",
      }),
    ).not.toBeNull();
  });
});

describe("what Create starts from", () => {
  it("starts from the first starter template, with the services the first launch found", async () => {
    const { session, requests } = await mountStarter();
    await waitFor(() => expect(startFrom().value).toBe(templateId));
    await waitFor(() =>
      expect(session().document.form.llm).toEqual({ provider: "claude-code", model: "sonnet" }),
    );
    expect(session().document.form.images).toEqual({ provider: "fal", model: "fal-ai/flux-2" });
    // Filled in, and saved with the draft.
    await act(async () => {
      await session().flush();
    });
    const saves = requests.filter((one) => one.method === "PUT" && /\/api\/drafts\//.test(one.url));
    const saved = (await saves.at(-1)?.clone().json()) as { document: PlayDraftDocument };
    expect(saved.document.form.llm.provider).toBe("claude-code");
    // Nothing on the screen needs fixing.
    expect(
      within(screen.getByRole("list", { name: "Setup" })).queryByRole("button", { name: /^Fix / }),
    ).toBeNull();
  });

  it("takes the image service whose key is saved when the first launch found none", async () => {
    const { session } = await mountStarter({
      "GET /api/providers": providers(true),
      "GET /api/providers/first-run": jsonAnswer({
        firstRun: false,
        detected: [],
        defaults: { llm: { provider: "claude-code", model: "sonnet" } },
        message: null,
        detail: null,
      }),
    });
    await waitFor(() => expect(startFrom().value).toBe(templateId));
    await waitFor(() =>
      expect(session().document.form.images).toEqual({ provider: "fal", model: "fal-ai/flux-2" }),
    );
    expect(session().document.form.llm).toEqual({ provider: "claude-code", model: "sonnet" });
    expect(
      within(screen.getByRole("list", { name: "Setup" })).queryByRole("button", { name: /^Fix / }),
    ).toBeNull();
  });

  it("keeps a blank setup once it is picked, instead of the starter", async () => {
    const { session } = await mountStarter();
    await waitFor(() => expect(startFrom().value).toBe(templateId));
    await userEvent.selectOptions(startFrom(), "");
    await waitFor(() => expect(session().document.templateSource).toBeUndefined());
    await userEvent.type(screen.getByLabelText(topicLabel), "Rope Tricks");
    await act(async () => {
      await session().newDraft();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(startFrom().value).toBe("");
    expect(session().document.templateSource).toBeUndefined();
  });

  it("carries what was typed into the template's topic", async () => {
    const { session } = await mountStarter({ "GET /api/onboarding": jsonAnswer({ packs: [] }) });
    await userEvent.type(screen.getByLabelText(topicLabel), "Cleopatra");
    await userEvent.selectOptions(startFrom(), templateId);
    await waitFor(() => expect(session().document.form.values.topic).toBe("Cleopatra"));
    expect((screen.getByLabelText(topicLabel) as HTMLInputElement).value).toBe("Cleopatra");
  });
});

describe("the draft's name and the title", () => {
  it("never shows a keyword in braces, and says the title once the topic makes it", async () => {
    await mountPlay(
      {},
      { ...freshDraftDocument, form: { ...freshDraftDocument.form, title: "Lore: {{topic}}" } },
    );
    const draft = () => screen.getByRole("button", { name: /^Draft: / }).textContent;
    expect(draft()).toBe("Draft: Untitled");
    expect(screen.queryByText(/\{\{/)).toBeNull();
    await userEvent.type(screen.getByLabelText(topicLabel), "Cleopatra");
    expect(screen.getByText(/^Title will be:/).textContent).toBe("Title will be: Lore: Cleopatra");
    expect(draft()).toBe("Draft: Lore: Cleopatra");
  });
});

describe("the rail", () => {
  it("says the expected length in minutes, and changes the words in place", async () => {
    await mountPlay({}, generatedRun);
    const start = within(screen.getByRole("region", { name: "Start" }));
    expect(start.getByText(/^Expected length:/).textContent).toBe(
      "Expected length: about 10 min · 1,500 words",
    );
    await userEvent.click(start.getByRole("button", { name: "Change the expected length" }));
    const words = start.getByLabelText("Words per video");
    await userEvent.clear(words);
    await userEvent.type(words, "3000");
    await userEvent.click(start.getByRole("button", { name: "Done" }));
    expect(start.getByText(/^Expected length:/).textContent).toBe(
      "Expected length: about 20 min · 3,000 words",
    );
  });

  it("checks the setup again when the person comes back to the window", async () => {
    const { requests } = await mountPlay({}, generatedRun);
    const reviews = () => requests.filter((one) => one.url.endsWith("/review")).length;
    await waitFor(() => expect(reviews()).toBeGreaterThan(0));
    const before = reviews();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(reviews()).toBeGreaterThan(before));
  });
});

describe("the channel", () => {
  const second = "44444444-4444-4444-8444-444444444444";
  const channel = (id: string, name: string) => ({
    id,
    name,
    isDefault: id === defaultChannelId,
    brand: {},
    seriesBrief: "",
    aiDisclosure: "auto",
    version: 1,
    createdAt: "a",
    updatedAt: "a",
    templates: 0,
    cast: 0,
  });

  it("is not asked with one channel, and is beside Start from with two, with its own row", async () => {
    await mountPlay({
      "GET /api/channels": jsonAnswer({ channels: [channel(defaultChannelId, "Main")] }),
    });
    expect(screen.queryByLabelText("For channel")).toBeNull();
    expect(document.querySelector('[data-setup-row="channel"]')).toBeNull();
    cleanup();

    const { session } = await mountPlay({
      "GET /api/channels": jsonAnswer({
        channels: [channel(defaultChannelId, "Main"), channel(second, "Second")],
      }),
    });
    const pick = await screen.findByLabelText("For channel");
    await userEvent.selectOptions(pick, second);
    expect(session().document.channelId).toBe(second);
    expect(
      document.querySelector('[data-setup-row="channel"] [data-row-summary]')?.textContent,
    ).toBe("For Second, with its brand kit (fonts, intro, outro and sounds).");
    expect(screen.queryByRole("dialog", { name: summaryTitle })).toBeNull();
  });

  it("says a template-made draft in the template's own channel is still the template's", async () => {
    await mountStarter({
      "GET /api/channels": jsonAnswer({
        channels: [channel(defaultChannelId, "Main"), channel(second, "Second")],
      }),
      // The saved template names no channel: it is listed in the default one, and the server
      // puts the draft made from it there.
      [`GET /api/project-templates/${templateId}`]: jsonAnswer({
        id: templateId,
        name: "Lore starter",
        version: 1,
        updatedAt: "2026-09-13T00:00:00.000Z",
        document: starter,
      }),
    });
    await waitFor(() => expect(startFrom().value).toBe(templateId));
    const origin = await waitFor(() => {
      const line = document.querySelector('[data-setup-row="channel"] [data-row-origin]');
      if (line === null) throw new Error("The Channel row says nothing about where it comes from.");
      return line;
    });
    expect(origin.textContent).toBe("From Lore starter");
  });
});

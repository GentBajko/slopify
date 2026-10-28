import type { DraftView, PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultChannelId } from "@/channels/api";
import { startedAt } from "@/lib/utils";
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

describe("what is being made", () => {
  it("puts a kind back as it was when the person comes back to it", async () => {
    const video: PlayDraftDocument = {
      ...generatedRun,
      form: {
        ...generatedRun.form,
        sources: { ...generatedRun.form.sources, thumbnail: "from_prompt" },
        thumbnailPrompt: "Title card",
        youtubeDescription: true,
      },
    };
    const { session } = await mountPlay({}, video);
    const kinds = within(screen.getByRole("radiogroup", { name: "What are you making?" }));
    const before = session().document.form;
    for (const away of ["Article", "Podcast", "Images"]) {
      await userEvent.click(kinds.getByRole("radio", { name: away }));
      expect(session().document.form.youtubeDescription).toBe(false);
      await userEvent.click(kinds.getByRole("radio", { name: "Video" }));
      const back = session().document.form;
      expect(back.sources).toEqual(before.sources);
      expect(back.youtubeDescription).toBe(true);
      expect(back.voices).toBeUndefined();
      expect(back.subtitles.mode).toBe(before.subtitles.mode);
    }
  });
});

describe("the topic box", () => {
  it("keeps the very first key typed into it", async () => {
    // A browser runs React's pending work between the page's capture and bubble listeners of a
    // key's input event (a microtask checkpoint after each listener); jsdom does not. Doing the
    // same here caught a capture handler on the page whose update drew the box back to empty
    // before the box's own change saw the key, so the first key typed was lost.
    const target = Object.getPrototypeOf(window.Node.prototype) as EventTarget;
    const add = target.addEventListener;
    target.addEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (type !== "input" || typeof listener !== "function") {
        add.call(this, type, listener, options);
        return;
      }
      add.call(
        this,
        type,
        function (this: EventTarget, event: Event) {
          listener.call(this, event);
          flushSync(() => {});
        },
        options,
      );
    };
    try {
      await mountPlay();
    } finally {
      target.addEventListener = add;
    }
    const box = screen.getByLabelText(topicLabel) as HTMLInputElement;
    for (const value of ["V", "Vo", "Vol"]) {
      fireEvent.input(box, { target: { value } });
      expect(box.value).toBe(value);
    }
  });

  it("keeps what came in since the page was last drawn when a key is typed", async () => {
    // A key handled before the page draws a change Create just made (the found services
    // filled in on arrival) must not put the draft back to what the page last drew.
    const { session } = await mountPlay();
    const box = screen.getByLabelText(topicLabel);
    const drawn = session().document;
    session().edit({
      ...drawn,
      form: { ...drawn.form, llm: { provider: "openrouter", model: "a-model" } },
    });
    fireEvent.input(box, { target: { value: "Rope" } });
    expect(session().latest?.().form.llm).toEqual({ provider: "openrouter", model: "a-model" });
    expect(session().latest?.().form.title).toBe("Rope");
  });

  it("stays quiet when the person only goes in and out of it, and says the hint's words once typed in", async () => {
    await mountPlay({}, { ...generatedRun, form: { ...generatedRun.form, title: "" } });
    const box = screen.getByLabelText(topicLabel);
    await userEvent.click(box);
    await userEvent.tab();
    expect(box.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByText("Fill in this field.")).toBeNull();
    await userEvent.type(box, "x");
    await userEvent.clear(box);
    await userEvent.tab();
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Type what the video is about")).not.toBeNull();
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

  it("reads with a saved voice whose service has a key when the template's voice service has none", async () => {
    // The starter reads with ElevenLabs; this computer has a Cartesia key and a Cartesia voice.
    const { session } = await mountStarter({
      "GET /api/providers": jsonAnswer({
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
            readiness: { kind: "keyed", hasKey: false },
          },
          {
            id: "cartesia",
            family: "tts",
            displayName: "Cartesia",
            readiness: { kind: "keyed", hasKey: true },
          },
          {
            id: "fal",
            family: "image",
            displayName: "fal.ai",
            readiness: { kind: "keyed", hasKey: true },
          },
        ],
      }),
      [`GET /api/project-templates/${templateId}`]: jsonAnswer({
        id: templateId,
        name: "Lore starter",
        version: 1,
        updatedAt: "2026-09-13T00:00:00.000Z",
        document: starter,
      }),
    });
    await waitFor(() => expect(startFrom().value).toBe(templateId));
    await waitFor(() =>
      expect(session().document.form.audio).toMatchObject({
        provider: "cartesia",
        model: "sonic-3.5",
        voice: "cartesia-other",
      }),
    );
    expect(
      within(screen.getByRole("list", { name: "Setup" })).queryByRole("button", { name: /^Fix / }),
    ).toBeNull();
    // Nothing was changed by the person, so the row is still the template's.
    await waitFor(() =>
      expect(
        document.querySelector('[data-setup-row="narration"] [data-row-origin]')?.textContent,
      ).toBe("From Lore starter"),
    );
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

  it("keeps the starter's services when the topic is typed before the model lists answer", async () => {
    // The acceptance testers' race: on a cold start the writer's model list answers after the
    // person has started typing, and the draft used to lose its writer and image service.
    let answer: () => void = () => {};
    const models = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const { session } = await mountStarter({
      "GET /api/providers/first-run": jsonAnswer({
        firstRun: false,
        detected: [],
        defaults: {},
        message: null,
        detail: null,
      }),
      "GET /api/providers/claude-code/models": async (request) => {
        await models;
        return jsonAnswer({
          models: [{ id: "sonnet", name: "Claude Sonnet" }],
          allowsCustom: true,
        })(request);
      },
    });
    await waitFor(() => expect(startFrom().value).toBe(templateId));
    await userEvent.type(screen.getByLabelText(topicLabel), "Volcanoes");
    // Nothing is said to be missing while the services are on their way.
    expect(document.querySelector("[data-row-problem]")).toBeNull();
    await act(async () => {
      answer();
    });
    await waitFor(() =>
      expect(session().document.form.llm).toEqual({ provider: "claude-code", model: "sonnet" }),
    );
    expect(session().document.form.images).toEqual({ provider: "fal", model: "fal-ai/flux-2" });
    expect(session().document.form.values.topic).toBe("Volcanoes");
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Setup" })).queryByRole("button", {
          name: /^Fix /,
        }),
      ).toBeNull(),
    );
  });

  it("picks the writer's model a first short picks, not the first listed, so visits agree", async () => {
    const { session } = await mountStarter({
      "GET /api/providers/first-run": jsonAnswer({
        firstRun: false,
        detected: [],
        defaults: {},
        message: null,
        detail: null,
      }),
      "GET /api/providers/claude-code/models": jsonAnswer({
        models: [
          { id: "fable", name: "Fable 5.1" },
          { id: "sonnet", name: "Sonnet 5.5" },
        ],
        allowsCustom: true,
      }),
    });
    await waitFor(() => expect(startFrom().value).toBe(templateId));
    await waitFor(() =>
      expect(session().document.form.llm).toEqual({ provider: "claude-code", model: "sonnet" }),
    );
  });

  it("takes the topic typed while the starter is applied into it, every key, in one draft", async () => {
    let made: () => void = () => {};
    const instantiating = new Promise<void>((resolve) => {
      made = resolve;
    });
    let read: () => void = () => {};
    const reading = new Promise<void>((resolve) => {
      read = resolve;
    });
    const routes = starterRoutes();
    const instantiate = routes[`POST /api/project-templates/${templateId}/instantiate`];
    const open = routes["GET /api/drafts/:id"];
    if (instantiate === undefined || open === undefined) throw new Error("No starter routes");
    const { session, requests } = await mountStarter({
      [`POST /api/project-templates/${templateId}/instantiate`]: async (request) => {
        await instantiating;
        return instantiate(request);
      },
      "GET /api/drafts/:id": async (request) => {
        await reading;
        return open(request);
      },
    });
    const box = screen.getByLabelText(topicLabel) as HTMLInputElement;
    // Create opens with the cursor in the topic box.
    await waitFor(() => expect(window.document.activeElement).toBe(box));
    await userEvent.keyboard("Volca");
    await act(async () => {
      made();
    });
    await waitFor(() =>
      expect(requests.some((one) => one.method === "GET" && /\/api\/drafts\/./.test(one.url))).toBe(
        true,
      ),
    );
    await userEvent.keyboard("noes");
    await act(async () => {
      read();
    });
    await waitFor(() => expect(startFrom().value).toBe(templateId));
    await waitFor(() => expect(session().document.form.values.topic).toBe("Volcanoes"));
    // The same box, still focused, now holds the template's topic.
    expect(screen.getByLabelText(topicLabel)).toBe(box);
    expect(window.document.activeElement).toBe(box);
    expect(box.value).toBe("Volcanoes");
    // The fresh form was never saved on its own: the starter's draft is the only one.
    expect(
      requests.filter((one) => one.method === "POST" && /\/api\/drafts$/.test(one.url)),
    ).toEqual([]);
  });

  it("offers the starter templates not added yet, and starts from one once picked", async () => {
    // A person who skipped the welcome: no templates, nothing added.
    let added = false;
    const routes = starterRoutes();
    const { session, requests } = await mountPlay(
      {
        ...routes,
        "GET /api/project-templates": (request) =>
          jsonAnswer({
            templates: added
              ? [
                  {
                    id: templateId,
                    name: "Lore starter",
                    version: 1,
                    updatedAt: "2026-09-13T00:00:00.000Z",
                  },
                ]
              : [],
          })(request),
        "GET /api/onboarding": (request) =>
          jsonAnswer({
            packs: [{ id: "lore", name: "Lore", summary: "", installed: added, templateId: null }],
          })(request),
        "POST /api/onboarding/packs/lore": (request) => {
          added = true;
          return jsonAnswer({ packId: "lore", added: true, templateId })(request);
        },
      },
      undefined,
      () => screen.findByRole("option", { name: "Lore starter" }),
    );
    expect(
      screen.getByText(
        "No templates yet: pick a starter template here, or set this video up and Save as template.",
      ),
    ).not.toBeNull();
    await userEvent.type(screen.getByLabelText(topicLabel), "Cleopatra");
    await userEvent.selectOptions(startFrom(), "pack:lore");
    await waitFor(() => expect(session().document.templateSource?.id).toBe(templateId));
    expect(requests.some((one) => one.url.endsWith("/api/onboarding/packs/lore"))).toBe(true);
    await waitFor(() => expect(session().document.form.values.topic).toBe("Cleopatra"));
    await waitFor(() => expect(startFrom().value).toBe(templateId));
  });

  it("gives a fresh draft the writer and image service the first launch found", async () => {
    const { session } = await mountPlay({
      "GET /api/providers/first-run": jsonAnswer({
        firstRun: true,
        detected: [],
        defaults: {
          llm: { provider: "claude-code", model: "sonnet" },
          images: { provider: "fal", model: "fal-ai/flux-2" },
        },
        message: null,
        detail: null,
      }),
    });
    await waitFor(() =>
      expect(session().document.form.llm).toMatchObject({
        provider: "claude-code",
        model: "sonnet",
      }),
    );
    expect(session().document.form.images).toMatchObject({
      provider: "fal",
      model: "fal-ai/flux-2",
    });
    expect(session().document.templateSource).toBeUndefined();
  });
});

describe("a draft Create reopens by itself", () => {
  it("says it is the draft from earlier, with New draft beside it", async () => {
    const id = "44444444-4444-4444-8444-444444444444";
    window.localStorage.setItem("slopify.play-draft", id);
    const { session } = await mountPlay();
    const header = await waitFor(() => {
      const meta = document.querySelector(".sl-page-header__meta");
      if (meta === null) throw new Error("Create says nothing about the draft it reopened.");
      return meta;
    });
    expect(header.textContent).toBe(`Your draft from ${startedAt("2026-09-13")}·New draft`);
    expect(session().activeId).toBe(id);
    await userEvent.click(within(header as HTMLElement).getByRole("button", { name: "New draft" }));
    await waitFor(() => expect(document.querySelector(".sl-page-header__meta")).toBeNull());
    expect(session().activeId).toBeNull();
  });

  it("says nothing on a draft the person opened or started here", async () => {
    await mountPlay();
    expect(document.querySelector(".sl-page-header__meta")).toBeNull();
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

  it("says at rest when the article prompt asks for another length", async () => {
    await mountPlay(
      {
        "GET /api/prompts": jsonAnswer({
          prompts: [
            {
              id: "Dossier",
              kind: "article",
              name: "Dossier",
              body: "Write about {{topic}} in 2800-3200 words.",
              slots: [],
              updatedAt: "2026-09-03T00:00:00.000Z",
            },
            {
              id: "Oils",
              kind: "image",
              name: "Oils",
              body: "An oil painting of {{topic}} in {{style}}.",
              slots: [],
              updatedAt: "2026-09-03T00:00:00.000Z",
            },
          ],
        }),
      },
      { ...generatedRun, expectedWords: "750" },
    );
    const start = within(screen.getByRole("region", { name: "Start" }));
    expect(start.getByText(/^Expected length:/).textContent).toBe(
      "Expected length: about 5 min · 750 words",
    );
    await waitFor(() =>
      expect(
        start.getByText(
          "The “Dossier” prompt asks for 2,800–3,200 words, so the video will be about 20 min.",
        ),
      ).not.toBeNull(),
    );
  });

  it("puts the Make button in the summary's foot when the summary covers the rail's", async () => {
    // A window too narrow for the summary beside the rail: the drawer spans the button.
    const box = (left: number, right: number): DOMRect =>
      ({ left, right, top: 0, bottom: 40, width: right - left, height: 40 }) as DOMRect;
    const measured = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.slot === "drawer") return box(232, 792);
        if (this.dataset.tour === "play-start") return box(660, 1000);
        return box(0, 0);
      });
    try {
      await mountPlay({}, generatedRun);
      await openSection("Review");
      const summary = screen.getByRole("dialog", { name: summaryTitle });
      expect(within(summary).getByRole("button", { name: makeKey })).not.toBeNull();
    } finally {
      measured.mockRestore();
    }
  });

  it("leaves the Make button to the rail when the summary opens beside it", async () => {
    await mountPlay({}, generatedRun);
    await openSection("Review");
    const summary = screen.getByRole("dialog", { name: summaryTitle });
    expect(within(summary).queryByRole("button", { name: makeKey })).toBeNull();
  });

  it("opens no row when the summary closes", async () => {
    await mountPlay({}, generatedRun);
    const rows = within(screen.getByRole("list", { name: "Setup" }));
    await userEvent.click(rows.getByRole("button", { name: "Change narration" }));
    const before = rows.queryAllByRole("button", { expanded: true }).map((one) => one.textContent);
    expect(before).toEqual(["Close narration"]);
    await openSection("Review");
    expect(screen.getByRole("dialog", { name: summaryTitle })).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: summaryTitle })).toBeNull());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(rows.queryAllByRole("button", { expanded: true }).map((one) => one.textContent)).toEqual(
      before,
    );
  });

  it("checks the setup again when the person comes back to the window, keeping the button ready", async () => {
    const { requests } = await mountPlay({}, generatedRun);
    const reviews = () => requests.filter((one) => one.url.endsWith("/review")).length;
    const start = within(screen.getByRole("region", { name: "Start" }));
    const make = () => start.getByRole("button", { name: makeKey }) as HTMLButtonElement;
    await waitFor(() => expect(make().disabled).toBe(false));
    const before = reviews();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    // Nothing changed, so nothing flickers: the button stays ready and the estimate stays.
    expect(make().disabled).toBe(false);
    expect(start.queryByText(/^Estimated cost: (calculating|shown once)/)).toBeNull();
    await waitFor(() => expect(reviews()).toBeGreaterThan(before));
    expect(make().disabled).toBe(false);
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

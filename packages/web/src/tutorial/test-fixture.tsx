import { stageKinds } from "@app/kernel/pipeline.js";
import type { RunDraft } from "@app/slices/admission/model.js";
import type { Prompt, PromptDraft } from "@app/slices/library/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";
import type { ProjectBody } from "@/api";
import { playRoutes } from "@/play/play-test-fixture";
import { createAppRouter } from "@/router";
import { type Answer, jsonAnswer, renderApp, testDeps, testVersion } from "@/test-app";
import { type TutorialStepId, tutorialSteps } from "./model";

const now = "2026-09-09T20:00:00.000Z";
const savedPrompts: readonly Prompt[] = [
  {
    id: "article-existing",
    kind: "article",
    name: "My article",
    body: "Write about {{topic}}.",
    slots: ["topic"],
    updatedAt: now,
  },
  {
    id: "image-existing",
    kind: "image",
    name: "My images",
    body: "An image of {{topic}}.",
    slots: ["topic"],
    updatedAt: now,
  },
];

function providers(ready: boolean): readonly ProviderStatus[] {
  return [
    {
      id: "openrouter",
      family: "llm",
      displayName: "OpenRouter",
      readiness: { kind: "keyed", hasKey: ready },
    },
    {
      id: "claude-code",
      family: "llm",
      displayName: "Claude Code CLI",
      readiness: { kind: "cli", installed: ready },
    },
    {
      id: "elevenlabs",
      family: "tts",
      displayName: "ElevenLabs",
      readiness: { kind: "keyed", hasKey: ready },
    },
    {
      id: "fal",
      family: "image",
      displayName: "fal.ai",
      readiness: { kind: "keyed", hasKey: ready },
    },
  ];
}

function refusedSave(): Response {
  return new Response(
    JSON.stringify({
      title: "Conflict",
      status: 409,
      detail: "Another prompt already has this name.",
      fields: [{ field: "name", message: "Another prompt already has this name." }],
    }),
    {
      status: 409,
      headers: { "content-type": "application/problem+json", "X-Slopify-Version": testVersion },
    },
  );
}

export async function mount(
  options: {
    readonly tutorial?: Answer;
    readonly saveTutorial?: Answer;
    readonly ready?: boolean;
    readonly notice?: Answer;
    readonly refusePrompt?: boolean;
    readonly initial?: string;
    readonly uploadAudio?: Answer;
    readonly uploadFont?: Answer;
    readonly completeProject?: boolean;
  } = {},
): Promise<{ router: ReturnType<typeof createAppRouter>; requests: string[] }> {
  let tutorialVersion = 0;
  let listed = providers(options.ready ?? true);
  const prompts = [...savedPrompts];
  const requests: string[] = [];
  let created: ProjectBody | undefined;
  const routes: Readonly<Record<string, Answer>> = {
    ...(options.uploadFont ? { "POST /api/fonts": options.uploadFont } : {}),
    "GET /api/tutorial":
      options.tutorial ??
      jsonAnswer({
        version: 0,
        readable: true,
        session: { schemaVersion: 1, active: false, stepId: "text-key" },
      }),
    "PUT /api/tutorial":
      options.saveTutorial ??
      (async (request) => {
        const input = (await request.json()) as { session: unknown };
        return jsonAnswer({ version: ++tutorialVersion, readable: true, session: input.session })(
          request,
        );
      }),
    "DELETE /api/tutorial": () => new Response(null, { status: 204 }),
    "GET /api/projects": jsonAnswer({ projects: [] }),
    "GET /api/update": jsonAnswer({
      currentVersion: testVersion,
      latestVersion: testVersion,
      available: false,
      canUpdate: false,
      busy: false,
      status: "idle",
    }),
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

    "GET /api/settings": jsonAnswer({ silenceGapSeconds: 3, appearance: "system" }),
    "GET /api/telemetry/notice":
      options.notice ?? jsonAnswer({ seen: true, appVersion: testVersion }),
    "POST /api/telemetry/notice": jsonAnswer({ seen: true, appVersion: testVersion }),
    "GET /api/providers": () =>
      jsonAnswer({ providers: listed })(new Request("http://slopify.test")),
    "PUT /api/providers/openrouter/key": () => {
      listed = listed.map((provider) =>
        provider.id === "openrouter"
          ? { ...provider, readiness: { kind: "keyed", hasKey: true } }
          : provider,
      );
      return jsonAnswer({ provider: "openrouter", hasKey: true, mask: "••••••••••••" })(
        new Request("http://slopify.test"),
      );
    },
    "GET /api/settings/voices": jsonAnswer({
      voices: [{ id: "voice-1", provider: "elevenlabs", name: "Narrator", voiceId: "narrator-1" }],
    }),
    "GET /api/prompts": (request) => jsonAnswer({ prompts })(request),
    "GET /api/entries": jsonAnswer({ entries: [] }),
    ...(options.uploadAudio
      ? { "PUT /api/drafts/:id/attachments/:attachmentId/file": options.uploadAudio }
      : {}),
    "POST /api/prompts": async (request) => {
      if (options.refusePrompt) return refusedSave();
      const draft = (await request.json()) as PromptDraft;
      const saved: Prompt = {
        ...draft,
        id: `saved-${draft.kind}`,
        slots: ["topic"],
        updatedAt: now,
      };
      prompts.push(saved);
      return jsonAnswer(saved, 201)(request);
    },
    "POST /api/projects/estimate": jsonAnswer({
      estimates: [
        {
          currency: "USD",
          rows: [],
          low: 0,
          high: 0,
          unknown: 0,
          expectedWords: 1500,
          catalogueDate: "2026-09-10",
          assumptions: [],
        },
      ],
    }),
    "GET /api/projects/queue": jsonAnswer({ queue: [] }),
    "POST /api/projects": async (request) => {
      const draft = (await request.json()) as RunDraft;
      const id = "actual-created-project";
      created = {
        revisionId: null,
        project: {
          id,
          title: draft.title,
          format: draft.format,
          status: options.completeProject ? "done" : "running",
          config: { ...draft, rendered: {} },
          createdAt: now,
          updatedAt: now,
        },
        stages: stageKinds.map((kind) => ({
          id: `stage-${kind}`,
          projectId: id,
          kind,
          source: draft.sources[kind],
          state: options.completeProject
            ? kind === "video" && draft.sources.audio !== "off"
              ? "done"
              : draft.sources[kind] === "off"
                ? "skipped"
                : "done"
            : "pending",
          failureReason: null,
          attemptCount: 0,
          progressCurrent: null,
          progressTotal: null,
          startedAt: null,
          finishedAt: null,
        })),
        outputs: options.completeProject
          ? [
              {
                id: "article-output",
                projectId: id,
                stageKind: "article",
                role: "article_md",
                path: "article.md",
                bytes: 20,
                originalFilename: null,
                durationMs: null,
                meta: {},
                createdAt: now,
              },
              ...(draft.sources.audio !== "off" && draft.sources.video === "off"
                ? [
                    {
                      id: "wav-output",
                      projectId: id,
                      stageKind: "video" as const,
                      role: "audio_export" as const,
                      path: "audio.wav",
                      bytes: 40,
                      originalFilename: null,
                      durationMs: 10000,
                      meta: {},
                      createdAt: now,
                    },
                  ]
                : []),
            ]
          : [],
      };
      return jsonAnswer(created, 201)(request);
    },
    "GET /api/projects/actual-created-project": (request) => jsonAnswer(created)(request),
    "GET /files/actual-created-project/article-md": () => new Response("My finished article."),
  };
  const recorded = new Proxy(playRoutes(routes), {
    get(target, key: string) {
      const answer = target[key];
      return answer
        ? (request: Request) => {
            requests.push(key);
            return answer(request);
          }
        : undefined;
    },
  });
  const router = createAppRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [options.initial ?? "/"] }) });
  renderApp(<RouterProvider router={router} />, testDeps(recorded));
  await screen.findByRole("button", { name: "Start interactive tutorial" });
  return { router, requests };
}

export function guide(): ReturnType<typeof within> {
  return within(screen.getByRole("region", { name: "Interactive getting started guide" }));
}

export async function at(id: TutorialStepId): Promise<void> {
  const step = tutorialSteps.find((step) => step.id === id);
  if (!step) throw new Error(`No tutorial step ${id}`);
  await screen.findByRole("heading", { name: step.title });
  await waitFor(() => expect(document.querySelector('[data-tutorial="hole"]')).not.toBeNull());
}

export async function start(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Start interactive tutorial" }));
  await at("text-key");
}

export async function skipTo(user: UserEvent, id: TutorialStepId): Promise<void> {
  const wanted = tutorialSteps.findIndex((step) => step.id === id);
  for (let index = 0; index < wanted; index += 1) {
    await user.click(guide().getByRole("button", { name: /^Skip/ }));
    const step = tutorialSteps[index + 1];
    if (step) await at(step.id);
  }
}

export async function fill(user: UserEvent, label: string, value: string): Promise<void> {
  const field = await screen.findByLabelText(label);
  await user.clear(field);
  await user.click(field);
  await user.paste(value);
}

export async function next(user: UserEvent, id: TutorialStepId): Promise<void> {
  await waitFor(() =>
    expect((guide().getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  await user.click(guide().getByRole("button", { name: "Next" }));
  await at(id);
}

export function nextHeld(): boolean {
  return (guide().getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled;
}

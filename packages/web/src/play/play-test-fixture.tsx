import type { Entry, Prompt } from "@app/slices/library/model.js";
import type { DraftAttachment, DraftView } from "@app/slices/play-drafts/model.js";
import { createDraftInputSchema, saveDraftInputSchema } from "@app/slices/play-drafts/schema.js";
import type { ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { type RenderResult, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { PlayForm } from "@/routes/play";
import { type Answer, jsonAnswer, renderApp, renderRouted, testDeps } from "@/test-app";
import { PlayDraftProvider, type PlaySession, usePlaySession } from "./draft-context";
import { freshDraftDocument } from "./draft-state";
import { legacyFixtureStart, reviewFixture } from "./review-test-fixture";

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

export const entries: readonly Entry[] = [
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

export function playRoutes(
  over: Readonly<Record<string, Answer>> = {},
): Readonly<Record<string, Answer>> {
  const saved = new Map<string, DraftView>();
  const current = (id: string): DraftView => saved.get(id) ?? draftView(id);
  const routes: Readonly<Record<string, Answer>> = {
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
    "POST /api/projects": jsonAnswer({ project: { id: "p1", status: "running" }, stages: [] }, 201),
    "GET /api/fonts": jsonAnswer({
      fonts: [{ id: "default", name: "Default", family: "Arial", source: "bundled" }],
    }),
    "GET /api/drafts": jsonAnswer({ drafts: [] }),
    "POST /api/drafts": async (request) => {
      const body = createDraftInputSchema.parse(await request.json());
      const view = {
        ...current(body.id),
        draft: { ...current(body.id).draft, document: body.document },
      };
      const provided = body.document.form.provided;
      const owned = {
        ...view,
        attachments: view.attachments.filter((attachment) =>
          [provided.audio, provided.thumbnail, ...provided.images].some(
            (ref) => ref?.attachmentId === attachment.id,
          ),
        ),
      };
      saved.set(body.id, owned);
      return jsonAnswer(owned)(request);
    },
    "PUT /api/drafts/:id": async (request) => {
      const id = new URL(request.url).pathname.split("/")[3];
      const body = saveDraftInputSchema.parse({ ...(await request.json()), id });
      const view = {
        ...current(body.id),
        review: null,
        draft: {
          ...current(body.id).draft,
          version: body.baseVersion + 1,
          document: body.document,
        },
      };
      const provided = body.document.form.provided;
      const owned = {
        ...view,
        attachments: view.attachments.filter((attachment) =>
          [provided.audio, provided.thumbnail, ...provided.images].some(
            (ref) => ref?.attachmentId === attachment.id,
          ),
        ),
      };
      saved.set(body.id, owned);
      return jsonAnswer(owned)(request);
    },
    "GET /api/drafts/:id": (request) =>
      jsonAnswer(current(new URL(request.url).pathname.split("/")[3] ?? ""))(request),
    "POST /api/drafts/:id/review": async (request) => {
      const id = new URL(request.url).pathname.split("/")[3] ?? "";
      const view = current(id);
      const listedPrompts = await routes["GET /api/prompts"]?.(request);
      const listedEntries = await routes["GET /api/entries"]?.(request);
      const promptData = listedPrompts
        ? ((await listedPrompts.json()) as { prompts: readonly Prompt[] })
        : { prompts };
      const entryData = listedEntries
        ? ((await listedEntries.json()) as { entries: readonly Entry[] })
        : { entries };
      const review = reviewFixture(view, entryData.entries, promptData.prompts);
      saved.set(id, { ...view, review });
      return jsonAnswer(review)(request);
    },
    "POST /api/drafts/:id/start": async (request) => {
      const id = new URL(request.url).pathname.split("/")[3] ?? "";
      const view = current(id);
      const body = (await request.clone().json()) as { baseVersion: number; reviewId: string };
      if (
        !view.review ||
        body.baseVersion !== view.review.draftVersion ||
        body.reviewId !== view.review.id
      )
        return jsonAnswer({ title: "Conflict", status: 409, reason: "stale-review" }, 409)(request);
      if (view.start) return jsonAnswer({ ...view.start, replayed: true })(request);
      const batch = view.review.runs.length > 1;
      const callback = routes[batch ? "POST /api/projects/batch" : "POST /api/projects"];
      const response = callback
        ? await legacyFixtureStart(request, view.review, callback, batch)
        : await jsonAnswer({
            requestId: view.review.id,
            projectIds: view.review.runs.map((_run, index) => `p${index + 1}`),
            queue: [],
            replayed: false,
          })(request);
      if (response.ok) saved.set(id, { ...view, start: await response.clone().json() });
      return response;
    },
    "DELETE /api/drafts/:id": jsonAnswer({ discarded: true }),
    ...over,
  };
  return new Proxy(routes, {
    get(target, key: string) {
      const answer =
        target[key] ??
        target[
          key
            .replace(/(\/api\/drafts)\/[a-f0-9-]{36}/, "$1/:id")
            .replace(/(\/attachments)\/[a-f0-9-]{36}/, "$1/:attachmentId")
        ];
      if (!answer) return answer;
      if (/^GET \/api\/drafts\/[a-f0-9-]{36}$/.test(key))
        return async (request: Request) => {
          const response = await answer(request);
          if (response.ok) {
            const view = (await response.clone().json()) as DraftView;
            saved.set(view.draft.id, view);
          }
          return response;
        };
      if (!key.includes("/attachments/")) return answer;
      return async (request: Request) => {
        const response = await answer(request);
        if (response.ok && request.method === "PUT") {
          const attachment = (await response.clone().json()) as DraftAttachment;
          const id = new URL(request.url).pathname.split("/")[3] ?? "";
          const view = current(id);
          const provided = view.draft.document.form.provided;
          if (
            ![provided.audio, provided.thumbnail, ...provided.images].some(
              (ref) => ref?.attachmentId === attachment.id,
            )
          )
            return response;
          saved.set(id, {
            ...view,
            attachments: [
              ...view.attachments.filter((item) => item.id !== attachment.id),
              attachment,
            ],
          });
        }
        return response;
      };
    },
  });
}

export function draftView(id: string, title = "Saved draft", version = 1): DraftView {
  return {
    draft: {
      id,
      version,
      createdAt: "2026-09-13",
      updatedAt: "2026-09-13",
      document: { ...freshDraftDocument, form: { ...freshDraftDocument.form, title } },
    },
    attachments: [],
    review: null,
    pendingStart: null,
    start: null,
  };
}

export async function mountPlay(
  overrides: Readonly<Record<string, Answer>> = {},
): Promise<{ readonly created: ReturnType<typeof vi.fn>; readonly requests: readonly Request[] }> {
  const created = vi.fn();
  const requests: Request[] = [];
  const deps = testDeps(playRoutes(overrides));
  const original = deps.api.fetch;
  renderRouted(
    <PlayDraftProvider>
      <PlayForm onCreated={created} />
    </PlayDraftProvider>,
    {
      ...deps,
      api: {
        ...deps.api,
        fetch: (input, init) => {
          const request = new Request(input, init);
          requests.push(request.clone());
          return original(input, init);
        },
      },
    },
  );
  await screen.findByRole("option", { name: "Dossier" });
  return { created, requests };
}

export function deferred(): {
  readonly promise: Promise<Response>;
  readonly resolve: (response: Response) => void;
} {
  let resolve: (response: Response) => void = () => {
    throw new Error("Not initialized");
  };
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function SessionProbe({
  capture,
}: {
  readonly capture: (session: PlaySession) => void;
}): ReactElement {
  const session = usePlaySession();
  capture(session);
  return (
    <>
      <input
        aria-label="Title"
        value={session.document.form.title}
        onChange={(event) =>
          session.edit({
            ...session.document,
            form: { ...session.document.form, title: event.target.value },
          })
        }
      />
      <output>{session.status}</output>
    </>
  );
}
export function mountSession(
  capture: (session: PlaySession) => void,
  over: Readonly<Record<string, Answer>> = {},
): RenderResult {
  return renderApp(
    <PlayDraftProvider>
      <SessionProbe capture={capture} />
    </PlayDraftProvider>,
    testDeps(playRoutes(over)),
  );
}

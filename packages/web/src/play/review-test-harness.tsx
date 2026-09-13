import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { act, type RenderResult, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { PlayForm } from "@/routes/play";
import { type Answer, renderRouted, testDeps } from "@/test-app";
import { PlayDraftProvider, type PlaySession, usePlaySession } from "./draft-context";
import { freshDraftDocument } from "./draft-state";
import { playRoutes } from "./play-test-fixture";

export const suppliedDocument: PlayDraftDocument = {
  ...freshDraftDocument,
  form: {
    ...freshDraftDocument.form,
    title: "Article only",
    sources: {
      research: "off",
      article: "provide",
      audio: "off",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
    provided: { ...freshDraftDocument.form.provided, article: "The supplied article." },
  },
};
export function reviewHarness(
  intercept: (request: Request, response: Response) => Promise<Response> = async (
    _request,
    response,
  ) => response,
  overrides: Readonly<Record<string, Answer>> = {},
): {
  readonly send: typeof fetch;
  readonly requests: readonly Request[];
  readonly created: ReturnType<typeof vi.fn>;
  readonly session: () => PlaySession;
  readonly restart: () => Promise<void>;
  readonly prepare: (document?: PlayDraftDocument) => Promise<void>;
} {
  const requests: Request[] = [];
  const created = vi.fn();
  const deps = testDeps(playRoutes(overrides));
  let captured: PlaySession | null = null;
  let mounted: RenderResult;
  function Capture(): ReactElement {
    captured = usePlaySession();
    return <PlayForm onCreated={created} />;
  }
  const session = (): PlaySession => {
    if (!captured) throw new Error("Session not mounted");
    return captured;
  };
  const mount = () => {
    mounted = renderRouted(
      <PlayDraftProvider>
        <Capture />
      </PlayDraftProvider>,
      {
        ...deps,
        api: {
          ...deps.api,
          fetch: async (input, init) => {
            const request = new Request(input, init);
            requests.push(request.clone());
            const response = await deps.api.fetch(input, init);
            return intercept(request, response);
          },
        },
      },
    );
  };
  mount();
  return {
    requests,
    send: deps.api.fetch,
    created,
    session,
    restart: async () => {
      mounted.unmount();
      captured = null;
      mount();
      await Promise.resolve();
    },
    prepare: async (document = suppliedDocument) => {
      await screen.findByRole("option", { name: "Dossier" });
      await act(async () => {
        session().edit(document);
        await session().navigate("review");
      });
    },
  };
}

export function reviewStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

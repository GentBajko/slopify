import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { RenderResult } from "@testing-library/react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { createApi } from "./api.js";
import type { AppDeps } from "./app-context.js";
import { AppProvider } from "./app-context.js";
import type { EventSourceLike } from "./events.js";
import { createVersionWatch, watchingFetch } from "./version.js";

// A component test hits this, never a server: a fake fetch answering a route table and a
// fake EventSource that never opens. Nothing here mocks past an interface the app uses.

export type Answer = (request: Request) => Response | Promise<Response>;

export const testOrigin = "http://slopify.test";
export const testVersion = "1.0.0";

export function jsonAnswer(body: unknown, status = 200): Answer {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "X-Slopify-Version": testVersion },
    });
}

export function problemAnswer(detail: string, status = 400): Answer {
  return () =>
    new Response(JSON.stringify({ title: "Bad Request", status, detail }), {
      status,
      headers: { "content-type": "application/problem+json", "X-Slopify-Version": testVersion },
    });
}

// 204 and friends: a Response built with a body at those statuses throws, so the
// no-content answers of the settings routes need their own helper.
export function emptyAnswer(status = 204): Answer {
  return () => new Response(null, { status, headers: { "X-Slopify-Version": testVersion } });
}

export function fakeFetch(routes: Readonly<Record<string, Answer>>): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const key = `${request.method} ${new URL(request.url).pathname}`;
    const answer = routes[key];
    if (answer === undefined) {
      return problemAnswer(`${key} is not in this test's route table.`, 404)(request);
    }
    return answer(request);
  };
}

// Never opens, so no stream fires and nothing reconnects unless a test asks it to.
export function silentEvents(): EventSourceLike {
  return {
    addEventListener: (): void => {},
    close: (): void => {},
  };
}

export function testDeps(routes: Readonly<Record<string, Answer>>): AppDeps {
  const version = createVersionWatch();
  return {
    api: createApi(testOrigin, watchingFetch(fakeFetch(routes), version)),
    openEvents: silentEvents,
    version,
  };
}

// A router the component under test can render `Link`s against. Its root renders the
// subject and never an Outlet, so the paths below exist only so a link resolves; they
// mirror router.tsx, which owns the real tree.
function testRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => ui });
  const nowhere = () => null;
  return createRouter({
    routeTree: rootRoute.addChildren({
      projects: createRoute({ getParentRoute: () => rootRoute, path: "/", component: nowhere }),
      play: createRoute({ getParentRoute: () => rootRoute, path: "play", component: nowhere }),
      schedules: createRoute({
        getParentRoute: () => rootRoute,
        path: "schedules",
        component: nowhere,
      }),
      templates: createRoute({
        getParentRoute: () => rootRoute,
        path: "templates",
        component: nowhere,
      }),
      settings: createRoute({
        getParentRoute: () => rootRoute,
        path: "settings",
        component: nowhere,
      }),
      usage: createRoute({ getParentRoute: () => rootRoute, path: "usage", component: nowhere }),
      project: createRoute({
        getParentRoute: () => rootRoute,
        path: "projects/$projectId",
        component: nowhere,
      }),
      prompts: createRoute({
        getParentRoute: () => rootRoute,
        path: "prompts",
        component: nowhere,
      }),
      newPrompt: createRoute({
        getParentRoute: () => rootRoute,
        path: "prompts/new",
        component: nowhere,
      }),
      prompt: createRoute({
        getParentRoute: () => rootRoute,
        path: "prompts/$promptId",
        component: nowhere,
      }),
      entries: createRoute({
        getParentRoute: () => rootRoute,
        path: "entries",
        component: nowhere,
      }),
      newEntry: createRoute({
        getParentRoute: () => rootRoute,
        path: "entries/new",
        component: nowhere,
      }),
      entry: createRoute({
        getParentRoute: () => rootRoute,
        path: "entries/$entryId",
        component: nowhere,
      }),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
}

export function renderApp(ui: ReactNode, deps: AppDeps): RenderResult & { readonly deps: AppDeps } {
  return mount(ui, deps);
}

// For a subject that renders a `Link`, which needs a router above it. The first paint is
// asynchronous, so every assertion under this one waits.
export function renderRouted(
  ui: ReactNode,
  deps: AppDeps,
): RenderResult & { readonly deps: AppDeps } {
  return mount(<RouterProvider router={testRouter(ui)} />, deps);
}

function mount(tree: ReactNode, deps: AppDeps): RenderResult & { readonly deps: AppDeps } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <AppProvider deps={deps}>{tree}</AppProvider>
    </QueryClientProvider>,
  );
  return { ...result, deps };
}

// Edit project shows one section at a time; a test reaches a field by opening its section
// the way a person would, from the section list beside the form.
export async function openEditSection(name: string): Promise<void> {
  const nav = await screen.findByRole("navigation", { name: "Edit sections" });
  await userEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${name}`) }));
}

// The project page opens on its Output tab; a view that is not showing is one press away.
export async function openProjectTab(name: "Output" | "Edit" | "History" | "Checkpoints") {
  const tab = await screen.findByRole("tab", { name: new RegExp(`^${name}`) });
  if (tab.getAttribute("aria-selected") !== "true") await userEvent.click(tab);
}

// Edit project lives on the Edit tab, beside Rebuild affected outputs.
export async function openProjectEditor(): Promise<void> {
  await openProjectTab("Edit");
  await userEvent.click(await screen.findByRole("button", { name: "Edit project" }));
}

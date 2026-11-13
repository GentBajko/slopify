import type { ProjectEvent } from "@app/edge/events/hub.js";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AppProvider } from "@/app-context";
import type { EventSourceLike } from "@/events";
import { keys } from "@/queries";
import { testDeps } from "@/test-app";
import { useLiveProject } from "./use-live.js";

afterEach(cleanup);

// How often each of the page's questions was asked of the server.
interface Asked {
  project: number;
  version: number;
  cost: number;
}

// The project page's live subscription beside three of the questions the page keeps open: the
// project, its saved version (megabytes on a finished project) and its run cost.
function Page({ asked }: { readonly asked: Asked }): null {
  useLiveProject("p1", "r1");
  useQuery({
    queryKey: keys.project("p1"),
    queryFn: () => {
      asked.project += 1;
      return { revisionId: "r1", project: { id: "p1", status: "running" }, stages: [] };
    },
  });
  useQuery({
    queryKey: keys.revision("p1", "r1"),
    queryFn: () => {
      asked.version += 1;
      return {};
    },
  });
  useQuery({
    queryKey: keys.runCost("p1"),
    queryFn: () => {
      asked.cost += 1;
      return {};
    },
  });
  return null;
}

async function watching(): Promise<{
  readonly asked: Asked;
  readonly emit: (event: ProjectEvent) => void;
}> {
  const asked: Asked = { project: 0, version: 0, cost: 0 };
  const listeners = new Map<string, ((message: MessageEvent<string>) => void)[]>();
  const source: EventSourceLike = {
    addEventListener: (type: string, listener: (message: MessageEvent<string>) => void): void => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    close: (): void => {
      listeners.clear();
    },
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppProvider deps={{ ...testDeps({}), openEvents: () => source }}>
        <Page asked={asked} />
      </AppProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(asked).toEqual({ project: 1, version: 1, cost: 1 }));
  return {
    asked,
    emit: (event): void => {
      act(() => {
        for (const listener of listeners.get(event.type) ?? [])
          listener(new MessageEvent(event.type, { data: JSON.stringify(event) }));
      });
    },
  };
}

it("answers a step's progress report with the project and its cost, not its saved version", async () => {
  const { asked, emit } = await watching();
  emit({
    type: "stage.progress",
    projectId: "p1",
    revisionId: "r1",
    workId: "w1",
    stage: "video",
    current: 3,
    total: 10,
  });
  await waitFor(() => expect(asked).toMatchObject({ project: 2, cost: 2 }));
  expect(asked.version).toBe(1);
});

it("asks for everything when a step of the run starts or ends", async () => {
  const { asked, emit } = await watching();
  emit({
    type: "stage.state",
    projectId: "p1",
    revisionId: "r1",
    workId: "w1",
    stage: "video",
    state: "done",
  });
  await waitFor(() => expect(asked).toEqual({ project: 2, version: 2, cost: 2 }));
});

it("answers progress from work on another version with the project alone, which says which version is current", async () => {
  const { asked, emit } = await watching();
  emit({
    type: "stage.progress",
    projectId: "p1",
    revisionId: "r0",
    workId: "w0",
    stage: "video",
    current: 3,
    total: 10,
  });
  await waitFor(() => expect(asked.project).toBe(2));
  expect(asked.version).toBe(1);
});

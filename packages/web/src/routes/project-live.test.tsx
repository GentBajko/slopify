import type { ProjectEvent } from "@app/edge/events/hub.js";
import type { StageKind, StageState } from "@app/kernel/pipeline.js";
import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "@/api";
import type { AppDeps } from "@/app-context";
import type { EventSourceLike } from "@/events";
import type { Answer } from "@/test-app";
import { fakeFetch, jsonAnswer, renderRouted, testOrigin } from "@/test-app";
import { createVersionWatch, watchingFetch } from "@/version";
import { ProjectRoute } from "./project.js";
import { openRunSettings, selectProjectStage } from "./project-fixtures.js";

afterEach(cleanup);

// A stand-in for the browser's EventSource the test can push frames and reconnects
// through. Nothing is mocked past the interface `events.ts` uses.
interface FakeSource extends EventSourceLike {
  readonly emit: (event: ProjectEvent) => void;
  readonly reopen: () => void;
}

function fakeSource(): FakeSource {
  const listeners = new Map<string, ((message: MessageEvent<string>) => void)[]>();
  return {
    addEventListener: (type: string, listener: (message: MessageEvent<string>) => void): void => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    close: (): void => {},
    emit: (event): void => {
      act(() => {
        for (const listener of listeners.get(event.type) ?? []) {
          listener(new MessageEvent(event.type, { data: JSON.stringify(event) }));
        }
      });
    },
    reopen: (): void => {
      act(() => {
        for (const listener of listeners.get("open") ?? []) {
          listener(new MessageEvent("open", { data: "" }));
        }
      });
    },
  };
}

function stage(kind: StageKind, state: StageState): Stage {
  return {
    id: `s-${kind}`,
    projectId: "p1",
    kind,
    source: "generate",
    state,
    failureReason: null,
    attemptCount: 0,
    progressCurrent: null,
    progressTotal: null,
    startedAt: null,
    finishedAt: null,
  };
}

function image(index: number): Output {
  return {
    id: `o-image-${String(index)}`,
    projectId: "p1",
    stageKind: "images",
    role: "image",
    path: "image.png",
    originalFilename: null,
    bytes: 10,
    durationMs: null,
    meta: { promptName: "Oils", index },
    createdAt: "2026-09-03T00:00:00.000Z",
  };
}

// The rows the fake server would answer with now. A test moves them between events, the
// way a run moves them between the frames it emits.
interface Server {
  landed: number;
  video: StageState;
  textModel?: string;
  article?: StageState;
  research?: StageState;
}

function view(server: Server) {
  return {
    project: {
      id: "p1",
      title: "Rope Tricks",
      format: "16:9",
      status: "running",
      config: {
        imagePrompts: [{ name: "Oils", number: 6 }],
        sources: server.textModel ? { article: "generate" } : {},
        ...(server.textModel ? { llm: { provider: "openrouter", model: server.textModel } } : {}),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    stages: [
      ...(server.research ? [stage("research", server.research)] : []),
      stage("article", server.article ?? "done"),
      stage("images", "running"),
      stage("video", server.video),
    ],
    outputs: Array.from({ length: server.landed }, (_, at) => image(at + 1)),
  };
}

function mount(server: Server): {
  readonly source: FakeSource;
  readonly reads: () => number;
} {
  let reads = 0;
  const source = fakeSource();
  const routes: Readonly<Record<string, Answer>> = {
    "GET /api/projects/p1": (request) => {
      reads += 1;
      return jsonAnswer(view(server))(request);
    },
    "GET /api/providers": jsonAnswer({ providers: [] }),
    "GET /api/prompts": jsonAnswer({ prompts: [] }),
    "GET /api/settings/voices": jsonAnswer({ voices: [] }),
    "GET /files/p1/article-md": () => new Response("Body.", { status: 200 }),
  };
  const version = createVersionWatch();
  const deps: AppDeps = {
    api: createApi(testOrigin, watchingFetch(fakeFetch(routes), version)),
    openEvents: () => source,
    version,
  };
  renderRouted(<ProjectRoute projectId="p1" />, deps);
  return { source, reads: () => reads };
}

describe("the page under a live run", () => {
  it("refetches saved provider configuration on project.updated", async () => {
    const server: Server = { landed: 0, video: "pending", textModel: "model-before" };
    const { source, reads } = mount(server);
    await openRunSettings();
    const model = await screen.findByLabelText("Text model");
    expect((model as HTMLInputElement).value).toBe("model-before");
    const before = reads();
    server.textModel = "model-after";
    source.emit({ type: "project.updated", projectId: "p1" });
    await waitFor(() =>
      expect((screen.getByLabelText("Text model") as HTMLInputElement).value).toBe("model-after"),
    );
    expect(reads()).toBe(before + 1);
  });

  it("flips a lamp and its state word from the event alone", async () => {
    const server: Server = { landed: 0, video: "pending" };
    const { source, reads } = mount(server);
    await screen.findByText("Images");
    const before = reads();

    server.video = "running";
    source.emit({ type: "stage.state", projectId: "p1", stage: "video", state: "running" });

    await waitFor(() => {
      expect(screen.getAllByRole("status").map((live) => live.textContent)).toContain(
        "Video: running",
      );
    });
    // One ask for the rows the event could not carry, not one per listener.
    expect(reads() - before).toBe(1);
  });

  it("moves a meter without asking the server at all", async () => {
    const server: Server = { landed: 0, video: "pending" };
    const { source, reads } = mount(server);
    await screen.findByText("Images");
    const before = reads();

    for (let at = 1; at <= 20; at += 1) {
      source.emit({
        type: "stage.progress",
        projectId: "p1",
        stage: "images",
        current: at,
        total: 20,
      });
    }

    await waitFor(() => {
      expect(
        within(screen.getByRole("region", { name: "Images workspace" })).getByText(
          "image 20 of 20",
        ),
      ).not.toBeNull();
    });
    expect(reads()).toBe(before);
  });

  it("shows article text as it streams, without a request per token", async () => {
    const server: Server = { landed: 0, video: "pending", article: "running" };
    const { source, reads } = mount(server);
    await screen.findByText("Article");
    const before = reads();

    for (const word of ["Most ", "villains ", "want."]) {
      source.emit({ type: "article.delta", projectId: "p1", text: word });
    }

    const content = screen.getByRole("region", { name: "Article content" });
    expect(await within(content).findByText("Most villains want.")).not.toBeNull();
    expect(reads()).toBe(before);
  });

  it("keeps distinct live writing tasks and replaces replayed text without duplicate output", async () => {
    const server: Server = { landed: 0, video: "pending", research: "running" };
    const { source, reads } = mount(server);
    await screen.findByRole("region", { name: "Research workspace" });
    const before = reads();
    source.emit({
      type: "llm.preview",
      projectId: "p1",
      stage: "research",
      callId: "notes",
      label: "Research notes",
      text: "First notes",
      reset: true,
    });
    source.emit({
      type: "llm.preview",
      projectId: "p1",
      stage: "research",
      callId: "sources",
      label: "Sources",
      text: "Source list",
      reset: true,
    });
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Live writing preview" }).textContent).toBe(
        "Source list",
      ),
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Live writing task" }),
      "notes",
    );
    source.emit({
      type: "llm.preview",
      projectId: "p1",
      stage: "research",
      callId: "notes",
      label: "Research notes",
      text: " continue.",
    });
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Live writing preview" }).textContent).toBe(
        "First notes continue.",
      ),
    );
    await selectProjectStage("Images");
    expect(screen.queryByRole("region", { name: "Live writing preview" })).toBeNull();
    source.emit({
      type: "llm.preview",
      projectId: "p1",
      stage: "research",
      callId: "notes",
      label: "Research notes",
      text: "Replayed current notes.",
      reset: true,
    });
    await selectProjectStage("Research");
    expect(screen.getByRole("region", { name: "Live writing preview" }).textContent).toBe(
      "Replayed current notes.",
    );
    expect(reads()).toBe(before);
  });

  it("folds a burst of landed images into far fewer reads than events", async () => {
    const server: Server = { landed: 0, video: "pending" };
    const { source, reads } = mount(server);
    await screen.findByText("Images");
    const before = reads();

    server.landed = 6;
    for (let at = 1; at <= 6; at += 1) {
      source.emit({
        type: "image.landed",
        projectId: "p1",
        outputId: `o-image-${String(at)}`,
        index: at,
      });
    }

    await waitFor(() => {
      expect(screen.getByText("Oils × 6")).not.toBeNull();
    });
    expect(reads() - before).toBeLessThan(6);
  });

  it("refetches on a reconnect, because the events it missed are never replayed", async () => {
    const server: Server = { landed: 0, video: "pending" };
    const { source, reads } = mount(server);
    await screen.findByText("Images");
    // The first open is the subscription itself.
    source.reopen();
    const before = reads();

    server.landed = 2;
    source.reopen();

    await waitFor(() => {
      expect(reads()).toBeGreaterThan(before);
    });
    await waitFor(() => {
      expect(screen.getByText("Oils × 2")).not.toBeNull();
    });
  });
});

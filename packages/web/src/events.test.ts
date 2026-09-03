import type { GlobalEvent, ProjectEvent } from "@app/edge/events/hub.js";
import { describe, expect, it, vi } from "vitest";
import type { EventSourceLike } from "./events.js";
import { subscribeGlobal, subscribeProject } from "./events.js";

// A stand-in for the browser's EventSource: it records the names that were subscribed to
// and lets a test push a frame or a reconnection through them. Nothing is mocked past
// the interface events.ts uses.
interface FakeSource extends EventSourceLike {
  readonly emit: (event: ProjectEvent | GlobalEvent) => void;
  readonly reopen: () => void;
  readonly closed: () => boolean;
}

function fakeSource(): FakeSource {
  const listeners = new Map<string, Array<(message: MessageEvent<string>) => void>>();
  let closed = false;
  const source: FakeSource = {
    addEventListener: (type: string, listener: (message: MessageEvent<string>) => void): void => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    close: (): void => {
      closed = true;
    },
    emit: (event): void => {
      for (const listener of listeners.get(event.type) ?? []) {
        listener(new MessageEvent(event.type, { data: JSON.stringify(event) }));
      }
    },
    reopen: (): void => {
      for (const listener of listeners.get("open") ?? []) {
        listener(new MessageEvent("open", { data: "" }));
      }
    },
    closed: (): boolean => closed,
  };
  return source;
}

function projectSink() {
  return { refetch: vi.fn(), appendArticle: vi.fn(), patch: vi.fn() };
}

describe("the project event stream", () => {
  it("patches the three events that carry their whole change", () => {
    const source = fakeSource();
    const sink = projectSink();
    subscribeProject(() => source, "/api/events/projects/p1", sink);

    const state = { type: "stage.state", projectId: "p1", stage: "video", state: "done" } as const;
    const meter = {
      type: "stage.progress",
      projectId: "p1",
      stage: "video",
      current: 1,
      total: 4,
    } as const;
    const project = { type: "project.state", projectId: "p1", state: "done" } as const;
    source.emit(state);
    source.emit(meter);
    source.emit(project);

    expect(sink.patch.mock.calls).toEqual([[state], [meter], [project]]);
    expect(sink.appendArticle).not.toHaveBeenCalled();
  });

  it("asks the server only for what an event cannot carry", () => {
    const source = fakeSource();
    const sink = projectSink();
    subscribeProject(() => source, "/api/events/projects/p1", sink);

    // A meter tick and a project word are complete in themselves; a landed image names an
    // output the page has never seen, and a stage reaching `done` has written files.
    source.emit({ type: "stage.progress", projectId: "p1", stage: "video", current: 1, total: 4 });
    source.emit({ type: "project.state", projectId: "p1", state: "running" });
    expect(sink.refetch).not.toHaveBeenCalled();

    source.emit({ type: "image.landed", projectId: "p1", outputId: "o1", index: 1 });
    source.emit({ type: "stage.state", projectId: "p1", stage: "images", state: "done" });
    expect(sink.refetch).toHaveBeenCalledTimes(2);
  });

  it("appends an article delta instead of refetching", () => {
    const source = fakeSource();
    const sink = projectSink();
    subscribeProject(() => source, "/api/events/projects/p1", sink);

    source.emit({ type: "article.delta", projectId: "p1", text: "Once " });
    source.emit({ type: "article.delta", projectId: "p1", text: "upon" });

    expect(sink.appendArticle.mock.calls).toEqual([["Once "], ["upon"]]);
    expect(sink.refetch).not.toHaveBeenCalled();
    expect(sink.patch).not.toHaveBeenCalled();
  });

  it("does not refetch when the stream first opens", () => {
    const source = fakeSource();
    const sink = projectSink();
    subscribeProject(() => source, "/api/events/projects/p1", sink);

    source.reopen();

    expect(sink.refetch).not.toHaveBeenCalled();
  });

  it("refetches on every reconnect, because the events it missed are never replayed", () => {
    const source = fakeSource();
    const sink = projectSink();
    subscribeProject(() => source, "/api/events/projects/p1", sink);

    source.reopen();
    source.reopen();
    source.reopen();

    expect(sink.refetch).toHaveBeenCalledTimes(2);
  });

  it("closes the stream when the subscription is dropped", () => {
    const source = fakeSource();
    subscribeProject(() => source, "/api/events/projects/p1", projectSink())();
    expect(source.closed()).toBe(true);
  });
});

describe("the global event stream", () => {
  it("takes the running tally off its own event and nothing else", () => {
    const source = fakeSource();
    const sink = { tally: vi.fn(), stagingChanged: vi.fn(), refetch: vi.fn() };
    subscribeGlobal(() => source, "/api/events/global", sink);

    source.emit({ type: "running.count", count: 2 });

    expect(sink.tally).toHaveBeenCalledWith(2);
    expect(sink.stagingChanged).not.toHaveBeenCalled();
  });

  it("reports staging progress and staging failure as a staging change", () => {
    const source = fakeSource();
    const sink = { tally: vi.fn(), stagingChanged: vi.fn(), refetch: vi.fn() };
    subscribeGlobal(() => source, "/api/events/global", sink);

    source.emit({
      type: "staging.progress",
      stagedFileId: "s1",
      stageKind: "audio",
      originalFilename: "body.mp3",
      bytes: 12,
      state: "staged",
    });
    source.emit({
      type: "staging.failed",
      stagedFileId: "s2",
      stageKind: "images",
      originalFilename: "shot.png",
      detail: "the disk is full",
    });

    expect(sink.stagingChanged).toHaveBeenCalledTimes(2);
    expect(sink.tally).not.toHaveBeenCalled();
  });

  it("refetches after a reconnect", () => {
    const source = fakeSource();
    const sink = { tally: vi.fn(), stagingChanged: vi.fn(), refetch: vi.fn() };
    subscribeGlobal(() => source, "/api/events/global", sink);

    source.reopen();
    source.reopen();

    expect(sink.refetch).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import type { Ids } from "../../kernel/ids.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import type { EventStream, Hub } from "./hub.js";
import { createHub } from "./hub.js";

interface Written {
  readonly event: string;
  readonly data: string;
  readonly id: string;
}

interface Recorded {
  readonly level: LogLevel;
  readonly event: string;
  readonly detail: string | undefined;
}

function counter(): Ids {
  let n = 0;
  return {
    next: (): string => {
      n += 1;
      return `id${n}`;
    },
  };
}

function recorder(): { log: Log; lines: Recorded[] } {
  const lines: Recorded[] = [];
  return {
    log: {
      write: (level: LogLevel, event: string, fields?: LogFields): void => {
        lines.push({ level, event, detail: fields?.detail });
      },
    },
    lines,
  };
}

function fakeStream(): { stream: EventStream; written: Written[] } {
  const written: Written[] = [];
  return {
    stream: {
      writeSSE: async (message): Promise<void> => {
        written.push(message);
      },
    },
    written,
  };
}

function deadStream(): EventStream {
  return {
    writeSSE: (): Promise<void> => Promise.reject(new Error("socket hung up")),
  };
}

function hub(): { hub: Hub; lines: Recorded[] } {
  const { log, lines } = recorder();
  return { hub: createHub({ ids: counter(), log }), lines };
}

describe("createHub", () => {
  it("sends running.count 0 to a new global subscriber", async () => {
    const { hub: h } = hub();
    const { stream, written } = fakeStream();

    void h.subscribeGlobal(stream, new AbortController().signal);
    await Promise.resolve();

    expect(written).toEqual([
      { event: "running.count", data: '{"type":"running.count","count":0}', id: "id1" },
    ]);
  });

  it("delivers a project event only to that project's subscribers", async () => {
    const { hub: h } = hub();
    const mine = fakeStream();
    const other = fakeStream();
    const global = fakeStream();
    void h.subscribe("p1", mine.stream, new AbortController().signal);
    void h.subscribe("p2", other.stream, new AbortController().signal);
    void h.subscribeGlobal(global.stream, new AbortController().signal);

    h.emit("p1", { type: "stage.state", projectId: "p1", stage: "article", state: "running" });
    await Promise.resolve();

    expect(mine.written).toEqual([
      {
        event: "stage.state",
        data: '{"type":"stage.state","projectId":"p1","stage":"article","state":"running"}',
        id: "id2",
      },
    ]);
    expect(other.written).toEqual([]);
    expect(global.written).toHaveLength(1);
  });

  it("emits to a project with no subscribers without failing", () => {
    const { hub: h } = hub();

    expect(() => {
      h.emit("nobody", { type: "project.state", projectId: "nobody", state: "done" });
    }).not.toThrow();
  });

  it("drops a subscriber when its request aborts and stops writing to it", async () => {
    const { hub: h } = hub();
    const { stream, written } = fakeStream();
    const aborter = new AbortController();
    const done = h.subscribe("p1", stream, aborter.signal);

    aborter.abort();
    await done;
    h.emit("p1", { type: "article.delta", projectId: "p1", text: "hello" });
    await Promise.resolve();

    expect(written).toEqual([]);
  });

  it("resolves at once for a request that was already aborted", async () => {
    const { hub: h } = hub();
    const { stream, written } = fakeStream();

    await h.subscribeGlobal(stream, AbortSignal.abort());

    expect(written).toEqual([]);
  });

  it("keeps serving the other subscribers when one write fails, and drops the dead one", async () => {
    const { hub: h, lines } = hub();
    const alive = fakeStream();
    const dead = h.subscribe("p1", deadStream(), new AbortController().signal);
    void h.subscribe("p1", alive.stream, new AbortController().signal);

    h.emit("p1", {
      type: "stage.progress",
      projectId: "p1",
      stage: "images",
      current: 1,
      total: 4,
    });
    await expect(dead).resolves.toBeUndefined();

    expect(alive.written).toHaveLength(1);
    expect(lines).toEqual([
      { level: "warn", event: "sse.write", detail: "stage.progress: socket hung up" },
    ]);
  });
});

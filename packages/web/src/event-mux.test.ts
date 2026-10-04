import { expect, it } from "vitest";
import { createEventMux } from "./event-mux.js";
import type { EventSourceLike } from "./events.js";

function fakeSource() {
  const opened: string[] = [];
  const listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  let closed = 0;
  const open = (url: string): EventSourceLike => {
    opened.push(url);
    return {
      addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      close: () => {
        closed += 1;
      },
    } as EventSourceLike;
  };
  const fire = (type: string, data: unknown = {}) => {
    for (const listener of listeners.get(type) ?? [])
      listener({ data: JSON.stringify(data) } as MessageEvent<string>);
  };
  return { open, opened, fire, closed: () => closed };
}

function record(source: EventSourceLike, names: readonly string[]) {
  const seen: string[] = [];
  source.addEventListener("open", () => seen.push("open"));
  for (const name of names)
    source.addEventListener(name, (event) => {
      seen.push(`${name}:${(JSON.parse(event.data) as { projectId?: string }).projectId ?? ""}`);
    });
  return seen;
}

it("opens one connection for the whole page and gives each view its own project's events", () => {
  const real = fakeSource();
  const open = createEventMux(real.open);
  const global = record(open("/api/events/global"), ["running.count", "stage.state"]);
  const p1 = record(open("/api/events/projects/p1"), ["stage.state"]);
  const p2 = record(open("/api/events/projects/p2"), ["stage.state"]);
  expect(real.opened).toEqual(["/api/events/global"]);
  real.fire("open");
  real.fire("running.count", { type: "running.count", count: 2 });
  real.fire("stage.state", { type: "stage.state", projectId: "p1" });
  expect(global).toEqual(["open", "running.count:", "stage.state:p1"]);
  expect(p1).toEqual(["open", "stage.state:p1"]);
  expect(p2).toEqual(["open"]);
});

it("replays what the models are writing to a view opened later, then says it reconnected", async () => {
  const real = fakeSource();
  const open = createEventMux(real.open);
  open("/api/events/global");
  real.fire("open");
  const call = { type: "llm.preview", projectId: "p1", callId: "c", stage: "research" };
  real.fire("llm.preview", { ...call, text: "Hello ", reset: true });
  real.fire("llm.preview", { ...call, text: "world" });
  const late = open("/api/events/projects/p1");
  const texts: string[] = [];
  let opens = 0;
  late.addEventListener("open", () => {
    opens += 1;
  });
  late.addEventListener("llm.preview", (event) => {
    texts.push((JSON.parse(event.data) as { text: string }).text);
  });
  await Promise.resolve();
  expect(opens).toBe(1);
  expect(texts).toEqual(["Hello world"]);
  // A later open is the browser reconnecting after a gap.
  real.fire("open");
  expect(opens).toBe(2);
});

it("closes the connection when the last view goes, and opens other streams as asked", () => {
  const real = fakeSource();
  const open = createEventMux(real.open);
  const a = open("/api/events/global");
  const b = open("/api/events/projects/p1");
  a.close();
  expect(real.closed()).toBe(0);
  b.close();
  expect(real.closed()).toBe(1);
  open("/api/something-else");
  expect(real.opened).toEqual(["/api/events/global", "/api/something-else"]);
});

it("tells every view the connection dropped, and opens a stream the browser gave up on again", () => {
  const sources: { listeners: Map<string, (() => void)[]>; readyState: number; closed: boolean }[] =
    [];
  const open = (): EventSourceLike => {
    const one = { listeners: new Map<string, (() => void)[]>(), readyState: 0, closed: false };
    sources.push(one);
    return {
      addEventListener: (type: string, listener: () => void) => {
        one.listeners.set(type, [...(one.listeners.get(type) ?? []), listener]);
      },
      close: () => {
        one.closed = true;
      },
      get readyState() {
        return one.readyState;
      },
    } as EventSourceLike;
  };
  const fire = (index: number, type: string) => {
    for (const listener of sources[index]?.listeners.get(type) ?? []) listener();
  };
  const later: (() => void)[] = [];
  const mux = createEventMux(open, (run) => later.push(run));
  const seen: string[] = [];
  const view = mux("/api/events/global");
  view.addEventListener("open", () => seen.push("open"));
  view.addEventListener("error", () => seen.push("error"));
  fire(0, "open");
  // The browser retries a dropped stream by itself: nothing to open again.
  fire(0, "error");
  expect(later).toHaveLength(0);
  const first = sources[0];
  if (first === undefined) throw new Error("no stream was opened");
  first.readyState = 2;
  fire(0, "error");
  expect(first.closed).toBe(true);
  expect(later).toHaveLength(1);
  later[0]?.();
  expect(sources).toHaveLength(2);
  fire(1, "open");
  expect(seen).toEqual(["open", "error", "error", "open"]);
});

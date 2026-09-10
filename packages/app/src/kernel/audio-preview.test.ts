import { describe, expect, it } from "vitest";
import { createAudioPreviewStore } from "./audio-preview.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (value: Uint8Array | undefined): string => new TextDecoder().decode(value);
function idOf(store: ReturnType<typeof createAudioPreviewStore>, project = "p1"): string {
  const id = store.list(project)[0]?.id;
  if (id === undefined) throw new Error("No preview");
  return id;
}

describe("live audio preview storage", () => {
  it("replays the prefix to late listeners then follows the same ongoing call", async () => {
    const store = createAudioPreviewStore();
    const sink = store.begin("p1", "body", "Body");
    sink.append(bytes("first"));
    const stream = store.stream("p1", idOf(store), new AbortController().signal);
    const reader = stream?.getReader();
    expect(text((await reader?.read())?.value)).toBe("first");
    const next = reader?.read();
    sink.append(bytes("second"));
    expect(text((await next)?.value)).toBe("second");
    sink.complete();
    expect((await reader?.read())?.done).toBe(true);
    expect(store.list("p1")[0]).toMatchObject({ label: "Body", state: "ready", bytes: 11 });
    expect(
      await new Response(store.stream("p1", idOf(store), new AbortController().signal)).text(),
    ).toBe("firstsecond");
  });
  it("retries with a new identity and invalidates listeners of the failed attempt", async () => {
    const store = createAudioPreviewStore();
    const old = store.begin("p1", "piece", "Body part 1 of 2");
    old.append(bytes("old"));
    const id = idOf(store);
    const reader = store.stream("p1", id, new AbortController().signal)?.getReader();
    await reader?.read();
    const waiting = reader?.read();
    const rejected = expect(waiting).rejects.toThrow("interrupted");
    const next = store.begin("p1", "piece", "Body part 1 of 2");
    await rejected;
    old.append(bytes("late"));
    next.append(bytes("fresh"));
    next.complete();
    expect(idOf(store)).not.toBe(id);
    expect(store.stream("p1", id, new AbortController().signal)).toBeUndefined();
    expect(
      await new Response(store.stream("p1", idOf(store), new AbortController().signal)).text(),
    ).toBe("fresh");
  });
  it("keeps parallel parts and projects separate and refuses another project's ID", () => {
    const store = createAudioPreviewStore();
    store.begin("p1", "body", "Body").append(bytes("one"));
    store.begin("p1", "intro", "Intro").append(bytes("two"));
    store.begin("p2", "body", "Body").append(bytes("three"));
    expect(store.list("p1").map((entry) => entry.label)).toEqual(["Body", "Intro"]);
    expect(store.stream("p2", idOf(store), new AbortController().signal)).toBeUndefined();
  });
  it("bounds total and per-request buffers without throwing into synthesis", () => {
    const store = createAudioPreviewStore({ maxBytes: 6, maxEntryBytes: 4 });
    const first = store.begin("p1", "a", "A");
    first.append(bytes("1234"));
    const second = store.begin("p1", "b", "B");
    second.append(bytes("567"));
    expect(store.list("p1").map((entry) => entry.state)).toEqual(["streaming", "unavailable"]);
    first.append(bytes("5"));
    first.complete();
    expect(store.list("p1").every((entry) => entry.bytes === 0)).toBe(true);
    const third = store.begin("p2", "c", "C");
    third.append(bytes("123"));
    expect(store.list("p2")[0]?.bytes).toBe(3);
  });
  it("caps entries, expires completed previews, and discards buffers on clear or close", () => {
    let now = 0;
    const store = createAudioPreviewStore({ maxEntries: 2, keepMs: 10, now: () => now });
    store.begin("p1", "a", "A").append(bytes("a"));
    const b = store.begin("p1", "b", "B");
    b.append(bytes("b"));
    store.begin("p1", "c", "C").append(bytes("c"));
    expect(store.list("p1")).toHaveLength(2);
    b.complete();
    now = 11;
    expect(store.list("p1").map((entry) => entry.label)).toEqual(["A"]);
    store.clear("p1");
    expect(store.list("p1")).toEqual([]);
    store.close();
    store.begin("p1", "d", "D").append(bytes("d"));
    expect(store.list("p1")).toEqual([]);
  });
  it("interrupts partial audio and closes waiting readers on shutdown or disconnect", async () => {
    for (const operation of ["interrupt", "close", "disconnect"] as const) {
      const store = createAudioPreviewStore();
      const sink = store.begin("p1", "a", "A");
      const controller = new AbortController();
      const reader = store.stream("p1", idOf(store), controller.signal)?.getReader();
      const waiting = reader?.read();
      const rejected = expect(waiting).rejects.toThrow();
      if (operation === "interrupt") sink.interrupt();
      if (operation === "close") store.close();
      if (operation === "disconnect") controller.abort();
      await rejected;
      store.close();
    }
  });
});

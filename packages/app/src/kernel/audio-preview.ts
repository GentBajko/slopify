import { randomUUID } from "node:crypto";

export interface AudioPreview {
  readonly id: string;
  readonly label: string;
  readonly state: "streaming" | "ready" | "interrupted" | "unavailable";
  readonly bytes: number;
}
export interface AudioPreviewSink {
  readonly append: (bytes: Uint8Array) => void;
  readonly complete: () => void;
  readonly interrupt: () => void;
}
export interface AudioPreviewStore {
  readonly begin: (projectId: string, key: string, label: string) => AudioPreviewSink;
  readonly list: (projectId: string) => readonly AudioPreview[];
  readonly stream: (
    projectId: string,
    id: string,
    signal: AbortSignal,
  ) => ReadableStream<Uint8Array> | undefined;
  readonly clear: (projectId: string) => void;
  readonly close: () => void;
}
interface Entry {
  readonly id: string;
  readonly projectId: string;
  readonly key: string;
  readonly label: string;
  readonly chunks: Uint8Array[];
  readonly changed: Set<() => void>;
  state: AudioPreview["state"];
  bytes: number;
  endedAt: number | undefined;
}
interface Limits {
  readonly maxBytes?: number;
  readonly maxEntryBytes?: number;
  readonly maxEntries?: number;
  readonly keepMs?: number;
  readonly now?: () => number;
}
const inactive: AudioPreviewSink = { append: () => {}, complete: () => {}, interrupt: () => {} };

// A preview is a disposable copy of bytes from the paid call already in flight.
// It never initiates synthesis, persists audio, or backpressures the provider.
// Readers pull from shared bounded storage, so a slow browser cannot grow a queue.
export function createAudioPreviewStore(limits: Limits = {}): AudioPreviewStore {
  const maxBytes = limits.maxBytes ?? 64 * 1024 * 1024;
  const maxEntryBytes = limits.maxEntryBytes ?? 16 * 1024 * 1024;
  const maxEntries = limits.maxEntries ?? 128;
  const keepMs = limits.keepMs ?? 5 * 60_000;
  const now = limits.now ?? Date.now;
  const entries = new Map<string, Entry>();
  let retained = 0;
  let closed = false;
  const notify = (entry: Entry): void => {
    const listeners = [...entry.changed];
    entry.changed.clear();
    for (const listener of listeners) listener();
  };
  const stop = (entry: Entry, state: "interrupted" | "unavailable"): void => {
    retained -= entry.bytes;
    entry.bytes = 0;
    entry.chunks.length = 0;
    entry.state = state;
    entry.endedAt = now();
    notify(entry);
  };
  const remove = (entry: Entry): void => {
    stop(entry, "interrupted");
    entries.delete(entry.id);
  };
  const prune = (): void => {
    for (const entry of entries.values()) {
      if (entry.endedAt !== undefined && now() - entry.endedAt >= keepMs) remove(entry);
    }
  };
  const expiry = setInterval(prune, Math.min(keepMs, 30_000));
  expiry.unref();
  const store: AudioPreviewStore = {
    begin(projectId, key, label) {
      if (closed) return inactive;
      prune();
      for (const entry of entries.values()) {
        if (entry.projectId === projectId && entry.key === key) remove(entry);
      }
      // At capacity, completed previews yield to current generation. Otherwise
      // this request has no preview; the normal durable narration still succeeds.
      if (entries.size >= maxEntries) {
        const oldest = [...entries.values()].find((entry) => entry.state !== "streaming");
        if (oldest !== undefined) remove(oldest);
      }
      if (entries.size >= maxEntries) return inactive;
      const entry: Entry = {
        id: randomUUID(),
        projectId,
        key,
        label,
        chunks: [],
        changed: new Set(),
        state: "streaming",
        bytes: 0,
        endedAt: undefined,
      };
      entries.set(entry.id, entry);
      const active = (): boolean => entries.get(entry.id) === entry && entry.state === "streaming";
      return {
        append(bytes) {
          if (!active() || bytes.byteLength === 0) return;
          if (
            retained + bytes.byteLength > maxBytes ||
            entry.bytes + bytes.byteLength > maxEntryBytes
          ) {
            stop(entry, "unavailable");
            return;
          }
          // Own these bounded buffers. A provider may reuse its read buffer.
          for (let at = 0; at < bytes.byteLength; at += 64 * 1024) {
            entry.chunks.push(bytes.slice(at, at + 64 * 1024));
          }
          retained += bytes.byteLength;
          entry.bytes += bytes.byteLength;
          notify(entry);
        },
        complete() {
          if (!active()) return;
          entry.state = "ready";
          entry.endedAt = now();
          notify(entry);
        },
        interrupt() {
          if (active()) stop(entry, "interrupted");
        },
      };
    },
    list(projectId) {
      prune();
      return [...entries.values()]
        .filter((entry) => entry.projectId === projectId)
        .map(({ id, label, state, bytes }) => ({ id, label, state, bytes }));
    },
    stream(projectId, id, signal) {
      prune();
      const entry = entries.get(id);
      if (
        entry === undefined ||
        entry.projectId !== projectId ||
        entry.state === "interrupted" ||
        entry.state === "unavailable"
      )
        return undefined;
      return follow(entry, signal);
    },
    clear(projectId) {
      for (const entry of entries.values()) if (entry.projectId === projectId) remove(entry);
    },
    close() {
      closed = true;
      clearInterval(expiry);
      for (const entry of entries.values()) remove(entry);
    },
  };
  return store;
}

function follow(entry: Entry, signal: AbortSignal): ReadableStream<Uint8Array> {
  let index = 0;
  let ended = false;
  let wake: (() => void) | undefined;
  let control: ReadableStreamDefaultController<Uint8Array> | undefined;
  const detach = (): void => {
    ended = true;
    signal.removeEventListener("abort", abort);
    if (wake !== undefined) {
      entry.changed.delete(wake);
      wake();
      wake = undefined;
    }
  };
  const abort = (): void => {
    if (ended) return;
    detach();
    control?.error(new Error("Audio preview disconnected"));
  };
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        control = controller;
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      },
      async pull(controller) {
        while (!ended) {
          if (entry.state === "interrupted" || entry.state === "unavailable") {
            detach();
            controller.error(new Error("Audio preview was interrupted"));
            return;
          }
          const bytes = entry.chunks[index];
          if (bytes !== undefined) {
            index += 1;
            controller.enqueue(bytes);
            return;
          }
          if (entry.state === "ready") {
            detach();
            controller.close();
            return;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
            entry.changed.add(resolve);
          });
        }
      },
      cancel() {
        detach();
      },
    },
    { highWaterMark: 0 },
  );
}

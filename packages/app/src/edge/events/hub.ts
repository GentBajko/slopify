import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { StageKind, StagingEvent } from "../../slices/storage/model.js";

export type StageState =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "canceled"
  | "provided"
  | "skipped";

export type ProjectState = "pending" | "running" | "done" | "failed" | "canceled";

export interface StageStateEvent {
  readonly type: "stage.state";
  readonly projectId: string;
  readonly stage: StageKind;
  readonly state: StageState;
  readonly failureReason?: string;
}

export interface StageProgressEvent {
  readonly type: "stage.progress";
  readonly projectId: string;
  readonly stage: StageKind;
  readonly current: number;
  readonly total: number;
}

export interface ArticleDeltaEvent {
  readonly type: "article.delta";
  readonly projectId: string;
  readonly text: string;
}

export interface ImageLandedEvent {
  readonly type: "image.landed";
  readonly projectId: string;
  readonly outputId: string;
  readonly index: number;
}

export interface ProjectStateEvent {
  readonly type: "project.state";
  readonly projectId: string;
  readonly state: ProjectState;
}

export interface RunningCountEvent {
  readonly type: "running.count";
  readonly count: number;
}

export type ProjectEvent =
  | StageStateEvent
  | StageProgressEvent
  | ArticleDeltaEvent
  | ImageLandedEvent
  | ProjectStateEvent;

// A staged upload has no project yet, so its progress goes to every open page
// (slices/storage/model.ts).
export type GlobalEvent = RunningCountEvent | StagingEvent;

export interface SseMessage {
  readonly event: string;
  readonly data: string;
  readonly id: string;
}

// The subset of Hono's SSEStreamingApi the hub needs, so the hub is testable without
// a request and cannot reach past the streaming interface.
export interface EventStream {
  readonly writeSSE: (message: SseMessage) => Promise<void>;
}

export interface HubDeps {
  readonly ids: Ids;
  readonly log: Log;
}

export interface Hub {
  readonly subscribe: (
    projectId: string,
    stream: EventStream,
    signal: AbortSignal,
  ) => Promise<void>;
  readonly subscribeGlobal: (stream: EventStream, signal: AbortSignal) => Promise<void>;
  readonly emit: (projectId: string, event: ProjectEvent) => void;
  readonly emitGlobal: (event: GlobalEvent) => void;
}

interface Subscriber {
  readonly stream: EventStream;
  readonly done: Promise<void>;
  readonly drop: () => void;
}

export function createHub(deps: HubDeps): Hub {
  const projects = new Map<string, Set<Subscriber>>();
  const globals = new Set<Subscriber>();

  const send = (subscriber: Subscriber, event: ProjectEvent | GlobalEvent): void => {
    // writeSSE rejects on a socket that is already gone, asynchronously and long after
    // emit() returned, so a dead subscriber is dropped here instead of at the call site.
    subscriber.stream
      .writeSSE({ event: event.type, data: JSON.stringify(event), id: deps.ids.next() })
      .catch((error: unknown) => {
        subscriber.drop();
        deps.log.write("warn", "sse.write", { detail: `${event.type}: ${messageOf(error)}` });
      });
  };

  const join = (
    set: Set<Subscriber>,
    stream: EventStream,
    signal: AbortSignal,
    prune: () => void,
  ): Subscriber => {
    let finish: () => void = (): void => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const subscriber: Subscriber = {
      stream,
      done,
      drop: (): void => {
        if (set.delete(subscriber)) {
          prune();
        }
        finish();
      },
    };
    set.add(subscriber);
    if (signal.aborted) {
      subscriber.drop();
    } else {
      signal.addEventListener("abort", subscriber.drop, { once: true });
    }
    return subscriber;
  };

  return {
    subscribe: (projectId: string, stream: EventStream, signal: AbortSignal): Promise<void> => {
      const set = projects.get(projectId) ?? new Set<Subscriber>();
      projects.set(projectId, set);
      return join(set, stream, signal, () => {
        if (set.size === 0) {
          projects.delete(projectId);
        }
      }).done;
    },

    subscribeGlobal: (stream: EventStream, signal: AbortSignal): Promise<void> => {
      const subscriber = join(globals, stream, signal, () => {});
      if (globals.has(subscriber)) {
        // The tally a page needs before anything happens. It is 0 until the runner of
        // step S4 owns the count; nothing else is emitted on this channel yet.
        send(subscriber, { type: "running.count", count: 0 });
      }
      return subscriber.done;
    },

    emit: (projectId: string, event: ProjectEvent): void => {
      for (const subscriber of projects.get(projectId) ?? []) {
        send(subscriber, event);
      }
    },

    emitGlobal: (event: GlobalEvent): void => {
      for (const subscriber of globals) {
        send(subscriber, event);
      }
    },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

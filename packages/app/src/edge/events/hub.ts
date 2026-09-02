import type {
  ArticleDeltaEvent,
  ImageLandedEvent,
  ProjectEvent,
  ProjectStateEvent,
  RunningCountEvent,
  StageProgressEvent,
  StageStateEvent,
} from "../../kernel/events.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { StagingEvent } from "../../slices/storage/model.js";

export type { ProjectState, StageState } from "../../kernel/pipeline.js";
export type {
  ArticleDeltaEvent,
  ImageLandedEvent,
  ProjectEvent,
  ProjectStateEvent,
  RunningCountEvent,
  StageProgressEvent,
  StageStateEvent,
};

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
  // The tally a page needs before anything else happens. The runner emits it when it
  // changes, so the newest one is kept here and replayed to whoever opens next; a page
  // that loads mid-render would otherwise be told nothing is running.
  let tally: RunningCountEvent = { type: "running.count", count: 0 };

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
        send(subscriber, tally);
      }
      return subscriber.done;
    },

    emit: (projectId: string, event: ProjectEvent): void => {
      for (const subscriber of projects.get(projectId) ?? []) {
        send(subscriber, event);
      }
    },

    emitGlobal: (event: GlobalEvent): void => {
      if (event.type === "running.count") {
        tally = event;
      }
      for (const subscriber of globals) {
        send(subscriber, event);
      }
    },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

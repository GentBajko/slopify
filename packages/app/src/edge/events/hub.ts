import type {
  ArticleDeltaEvent,
  ImageLandedEvent,
  ProjectEvent,
  ProjectStateEvent,
  ProjectUpdatedEvent,
  ReviewFlaggedEvent,
  RunningCountEvent,
  ScheduleTopicsEvent,
  StageProgressEvent,
  StageStateEvent,
} from "../../kernel/events.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { StagingEvent } from "../../slices/storage/model.js";
import { createPreviewCache } from "./preview-cache.js";

export type { ProjectState, StageState } from "../../kernel/pipeline.js";
export type {
  ArticleDeltaEvent,
  ImageLandedEvent,
  ProjectEvent,
  ProjectStateEvent,
  ReviewFlaggedEvent,
  RunningCountEvent,
  ScheduleTopicsEvent,
  StageProgressEvent,
  StageStateEvent,
};

// What only the global stream carries. It carries every project event too: a browser allows
// six connections to one address over HTTP/1.1, and a stream per open project used them up
// until the page's own requests waited forever, so each page opens this one stream and hands
// each project's events to whatever shows that project (`web/src/event-mux.ts`).
export type GlobalEvent =
  | RunningCountEvent
  | ScheduleTopicsEvent
  | StagingEvent
  | ProjectStateEvent
  | ProjectUpdatedEvent
  | ReviewFlaggedEvent;

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
  readonly acceptEvent?: (event: ProjectEvent) => boolean;
  // The event as pages should see it (carried work told under the current revision), or
  // undefined for one they must not. Takes the place of `acceptEvent` when given.
  readonly presentEvent?: (event: ProjectEvent) => ProjectEvent | undefined;
  // How often an idle stream is sent a heartbeat, so nothing between the page and Slopify
  // closes it for being quiet. Tests pass 0 to send none.
  readonly heartbeatMs?: number;
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
  const previews = createPreviewCache();
  const projects = new Map<string, Set<Subscriber>>();
  const globals = new Set<Subscriber>();
  // The tally a page needs before anything else happens. The runner emits it when it
  // changes, so the newest one is kept here and replayed to whoever opens next; a page
  // that loads mid-render would otherwise be told nothing is running.
  let tally: RunningCountEvent = { type: "running.count", count: 0 };

  const present = (event: ProjectEvent): ProjectEvent | undefined =>
    deps.presentEvent !== undefined
      ? deps.presentEvent(event)
      : deps.acceptEvent?.(event) === false
        ? undefined
        : event;
  const heartbeatMs = deps.heartbeatMs ?? 20_000;

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
      if (heartbeatMs > 0) {
        const beat = setInterval(() => {
          subscriber.stream
            .writeSSE({ event: "ping", data: "", id: deps.ids.next() })
            .catch(() => subscriber.drop());
        }, heartbeatMs);
        beat.unref?.();
        void done.then(() => clearInterval(beat));
      }
    }
    return subscriber;
  };

  return {
    subscribe: (projectId: string, stream: EventStream, signal: AbortSignal): Promise<void> => {
      const set = projects.get(projectId) ?? new Set<Subscriber>();
      projects.set(projectId, set);
      const subscriber = join(set, stream, signal, () => {
        if (set.size === 0) {
          projects.delete(projectId);
        }
      });
      if (set.has(subscriber))
        for (const event of previews.snapshot(projectId)) {
          const shown = present(event);
          if (shown !== undefined) send(subscriber, shown);
        }
      return subscriber.done;
    },

    subscribeGlobal: (stream: EventStream, signal: AbortSignal): Promise<void> => {
      const subscriber = join(globals, stream, signal, () => {});
      if (globals.has(subscriber)) {
        send(subscriber, tally);
        // What the AI models are writing right now, so a page opened mid-call shows it.
        for (const event of previews.snapshotAll()) {
          const shown = present(event);
          if (shown !== undefined) send(subscriber, shown);
        }
      }
      return subscriber.done;
    },

    emit: (projectId: string, event: ProjectEvent): void => {
      const shown = present(event);
      if (shown !== undefined) previews.observe(shown);
      else if (event.type === "stage.state") previews.observe(event);
      if (shown === undefined) return;
      for (const subscriber of projects.get(projectId) ?? []) send(subscriber, shown);
      for (const subscriber of globals) send(subscriber, shown);
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

// Every project event also goes to `observe` (the run notifier), after the open pages have
// it, whether or not a page is open to receive it.
export function observedHub(hub: Hub, observe: (event: ProjectEvent) => void): Hub {
  return {
    ...hub,
    emit: (projectId, event) => {
      hub.emit(projectId, event);
      observe(event);
    },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

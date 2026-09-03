import type { GlobalEvent, ProjectEvent } from "@app/edge/events/hub.js";

// One EventSource per open project page and one for the running tally. Every frame the
// hub writes names its own type (`event: stage.state`), so the listener is registered
// per name and the name is the discriminant; nothing has to guess at the payload.

export interface EventSourceLike {
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export type OpenEvents = (url: string) => EventSourceLike;

export interface ProjectSink {
  // 04-data-flow, SSE disconnect: the browser reconnects by itself and the events it
  // missed are never replayed, so the page refetches instead of resuming.
  readonly refetch: () => void;
  // The one event that patches rather than refetches: the article arrives as a stream of
  // deltas, and asking the server for the whole project per token would be absurd.
  readonly appendArticle: (text: string) => void;
}

export interface GlobalSink {
  readonly tally: (count: number) => void;
  readonly stagingChanged: () => void;
  readonly refetch: () => void;
}

const projectEventNames = [
  "stage.state",
  "stage.progress",
  "article.delta",
  "image.landed",
  "project.state",
] as const;

const globalEventNames = ["running.count", "staging.progress", "staging.failed"] as const;

export function subscribeProject(open: OpenEvents, url: string, sink: ProjectSink): () => void {
  return listen(open, url, projectEventNames, sink.refetch, (event) => {
    if (event.type === "article.delta") {
      sink.appendArticle(event.text);
      return;
    }
    sink.refetch();
  });
}

export function subscribeGlobal(open: OpenEvents, url: string, sink: GlobalSink): () => void {
  return listen(open, url, globalEventNames, sink.refetch, (event) => {
    if (event.type === "running.count") {
      sink.tally(event.count);
      return;
    }
    sink.stagingChanged();
  });
}

function listen<Event extends ProjectEvent | GlobalEvent>(
  open: OpenEvents,
  url: string,
  names: readonly Event["type"][],
  onReconnect: () => void,
  onEvent: (event: Event) => void,
): () => void {
  const source = open(url);
  let opened = false;
  source.addEventListener("open", () => {
    // The first open is the subscription itself; every later one closed a gap.
    if (opened) {
      onReconnect();
    }
    opened = true;
  });
  for (const name of names) {
    source.addEventListener(name, (message) => {
      const event = parse<Event>(message.data);
      // A frame whose payload disagrees with the name it arrived under is a server bug,
      // not something to render.
      if (event.type === name) {
        onEvent(event);
      }
    });
  }
  return (): void => {
    source.close();
  };
}

// The hub writes `JSON.stringify(event)` of the union above, so the parse is a cast at
// the one place the wire turns back into the shared type.
function parse<Event>(data: string): Event {
  return JSON.parse(data) as Event;
}

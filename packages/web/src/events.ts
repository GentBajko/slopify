import type { GlobalEvent, ProjectEvent } from "@app/edge/events/hub.js";
import type { PatchEvent } from "@/project/live";

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
  // On an SSE disconnect the browser reconnects by itself and the events it missed are
  // never replayed, so the page refetches instead of resuming. It is also what
  // fetches the rows an event cannot carry: the output an image landed as, and the files a
  // stage wrote on its way to `done`.
  readonly refetch: () => void;
  // The one event that only patches: the article arrives as a stream of deltas, and asking
  // the server for the whole project per token would be absurd.
  readonly appendArticle: (text: string) => void;
  // The three events that carry their whole change. Patching them puts the lamp, the state word
  // and the meter on the page in the frame the event arrived in, which is the signature
  // interaction, and it is what keeps a meter ticking from asking the server sixty times.
  readonly patch: (event: PatchEvent) => void;
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
  return listen<ProjectEvent>(open, url, projectEventNames, sink.refetch, (event) => {
    if (event.type === "article.delta") {
      sink.appendArticle(event.text);
      return;
    }
    if (event.type === "image.landed") {
      // The frame names an output id and an index, not the row or the file behind them,
      // so this is the one event the page cannot paint without asking.
      sink.refetch();
      return;
    }
    sink.patch(event);
    // A stage reaching a new state has usually just written the files its body draws, and
    // `stage.progress` has not, so only the former asks.
    if (event.type === "stage.state") {
      sink.refetch();
    }
  });
}

export function subscribeGlobal(open: OpenEvents, url: string, sink: GlobalSink): () => void {
  return listen<GlobalEvent>(open, url, globalEventNames, sink.refetch, (event) => {
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

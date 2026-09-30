import type { ProjectEvent } from "@app/edge/events/hub.js";
import { createPreviewCache } from "@app/edge/events/preview-cache.js";
import type { EventSourceLike, OpenEvents } from "./events.js";

// One live connection per page. Over HTTP/1.1 a browser keeps at most six connections to one
// address, and every EventSource holds one for good: a stream per open project (the project
// page, each "Running now" card) plus the shell's own used them up, and the page's requests
// then waited forever — events arrived but nothing on the page could reload. So the shell's
// global stream carries every project's events too (`edge/events/hub.ts`), and this hands out
// stand-ins: the global URL gets everything, a project's URL gets that project's events, and
// no second connection is opened.
//
// The server replays what the AI models are writing when the stream opens; a project view
// opened later gets the same from the copy kept here.

const projectUrl = /\/events\/projects\/([^/?#]+)/;
const globalUrl = /\/events\/global(?:[?#]|$)/;

// Every event name the hub writes, so one listener per name serves every stand-in.
const names = [
  "running.count",
  "staging.progress",
  "staging.failed",
  "schedule.topics",
  "stage.state",
  "stage.progress",
  "article.delta",
  "llm.preview",
  "image.landed",
  "narration.piece",
  "project.state",
  "project.updated",
  "review.flagged",
] as const;

interface StandIn {
  // Undefined for the global view, which gets everything.
  readonly projectId: string | undefined;
  readonly listeners: Map<string, Set<(event: MessageEvent<string>) => void>>;
  readonly opens: Set<() => void>;
}

export function createEventMux(open: OpenEvents): OpenEvents {
  const standIns = new Set<StandIn>();
  const previews = createPreviewCache();
  let source: EventSourceLike | undefined;
  let opened = false;

  const deliver = (standIn: StandIn, name: string, data: string): void => {
    for (const listener of standIn.listeners.get(name) ?? [])
      listener({ data } as MessageEvent<string>);
  };

  const connect = (wanted: string): void => {
    if (source !== undefined) return;
    const real = open(wanted);
    source = real;
    real.addEventListener("open", () => {
      opened = true;
      for (const standIn of [...standIns]) for (const listener of standIn.opens) listener();
    });
    for (const name of names)
      real.addEventListener(name, (message) => {
        let projectId: string | undefined;
        try {
          const parsed = JSON.parse(message.data) as { projectId?: unknown };
          if (typeof parsed.projectId === "string") projectId = parsed.projectId;
          if (name === "llm.preview" || name === "stage.state")
            previews.observe(parsed as ProjectEvent);
        } catch {
          return;
        }
        for (const standIn of [...standIns])
          if (standIn.projectId === undefined || standIn.projectId === projectId)
            deliver(standIn, name, message.data);
      });
  };

  return (wanted: string): EventSourceLike => {
    const project = projectUrl.exec(wanted)?.[1];
    // Anything that is neither a project's stream nor the global one opens as it asks.
    if (project === undefined && !globalUrl.test(wanted)) return open(wanted);
    connect(project === undefined ? wanted : wanted.replace(projectUrl, "/events/global"));
    const standIn: StandIn = {
      projectId: project === undefined ? undefined : decodeURIComponent(project),
      listeners: new Map(),
      opens: new Set(),
    };
    standIns.add(standIn);
    // Already open: this view's first "open" is its own subscription (no refetch), then what
    // the models are writing now.
    if (opened)
      queueMicrotask(() => {
        if (!standIns.has(standIn)) return;
        for (const listener of standIn.opens) listener();
        if (standIn.projectId !== undefined)
          for (const event of previews.snapshot(standIn.projectId))
            deliver(standIn, "llm.preview", JSON.stringify(event));
      });
    return {
      addEventListener: (type: string, listener: (event: MessageEvent<string>) => void): void => {
        if (type === "open") {
          standIn.opens.add(listener as () => void);
          return;
        }
        const set = standIn.listeners.get(type) ?? new Set();
        set.add(listener);
        standIn.listeners.set(type, set);
      },
      close: (): void => {
        standIns.delete(standIn);
        if (standIns.size === 0 && source !== undefined) {
          source.close();
          source = undefined;
          opened = false;
        }
      },
    } as EventSourceLike;
  };
}

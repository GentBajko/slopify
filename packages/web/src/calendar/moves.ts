import type { Calendar, CalendarRun } from "@app/slices/schedules/schema.js";
import type { Drop } from "./plan";

type Applied = Extract<Drop, { readonly kind: "move" | "transfer" }>;

// What the schedules read after a move, as far as the undo needs: each one's version and
// queue length.
export interface MoveResult {
  readonly source: { readonly version: number; readonly items: readonly unknown[] };
  readonly target?: { readonly version: number; readonly items: readonly unknown[] };
}

// The move that puts a topic back where it was, at the versions the move left behind.
export function undoOf(drop: Applied, result: MoveResult): Applied {
  if (drop.kind === "move")
    return {
      kind: "move",
      scheduleId: drop.scheduleId,
      baseVersion: result.source.version,
      from: drop.to,
      to: drop.from,
    };
  const target = result.target ?? result.source;
  return {
    kind: "transfer",
    scheduleId: drop.targetId,
    baseVersion: target.version,
    // A transfer without a place went to the end of the other queue.
    index: drop.position ?? target.items.length - 1,
    targetId: drop.scheduleId,
    position: drop.index,
  };
}

// The calendar as it will read once a move within one schedule lands: each run takes the
// topic at its place in the reordered queue. Shown at once, put back if the server refuses.
// A transfer between schedules changes two queues and waits for the server instead.
export function optimisticMove(calendar: Calendar, drop: Applied): Calendar {
  if (drop.kind !== "move") return calendar;
  const own = calendar.runs
    .filter((run) => run.scheduleId === drop.scheduleId && run.index !== null)
    .toSorted((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const topics = own.map(topicOf);
  const [moved] = topics.splice(drop.from, 1);
  if (moved === undefined) return calendar;
  topics.splice(drop.to, 0, moved);
  const next = new Map(own.map((run, place) => [run, topics[place]]));
  return {
    ...calendar,
    runs: calendar.runs.map((run) => {
      const topic = next.get(run);
      return topic === undefined ? run : { ...run, ...topic };
    }),
  };
}

function topicOf(run: CalendarRun) {
  return {
    topic: run.topic,
    topicSource: run.topicSource,
    renderedTitle: run.renderedTitle,
    prepared: run.prepared,
  };
}

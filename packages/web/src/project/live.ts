import type {
  ProjectStateEvent,
  StageProgressEvent,
  StageStateEvent,
} from "@app/edge/events/hub.js";
import type { Stage } from "@app/slices/admission/model.js";
import type { ProjectBody } from "@/api";

// What a live event does to the page that is already open. Three of the five project events
// carry their whole change, so the cached body is rewritten from them and the lamp flips in the
// same frame the frame arrived in; only `image.landed` and a reconnect need the server. Pure,
// so the rule is testable without a query client.

export type PatchEvent = StageStateEvent | StageProgressEvent | ProjectStateEvent;

export function patchProject(
  body: ProjectBody | undefined,
  event: PatchEvent,
): ProjectBody | undefined {
  if (body === undefined) {
    return undefined;
  }
  if (event.type === "project.state") {
    return { ...body, project: { ...body.project, status: event.state } };
  }
  const at = body.stages.findIndex((stage) => stage.kind === event.stage);
  const stage = body.stages[at];
  if (stage === undefined) {
    return body;
  }
  return { ...body, stages: body.stages.with(at, patchStage(stage, event)) };
}

function patchStage(stage: Stage, event: StageStateEvent | StageProgressEvent): Stage {
  if (event.type === "stage.progress") {
    return { ...stage, progressCurrent: event.current, progressTotal: event.total };
  }
  return {
    ...stage,
    state: event.state,
    // The provider's own words reach the row through here and are never rewritten. An event
    // without one leaves the reason the row already held, because the refetch this same event
    // schedules is what replaces it.
    failureReason: event.failureReason ?? stage.failureReason,
  };
}

export interface Coalescer {
  readonly ask: () => void;
  readonly stop: () => void;
}

// A run of 60 images lands 60 `image.landed` frames, and a refetch each would be a storm
// that outpaces the render it is watching. The first ask runs at once, so a lone event is
// never delayed; every ask inside the window that follows collapses into one more run at
// its end.
export function coalesce(run: () => void, delayMs: number): Coalescer {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let asked = false;

  const close = (): void => {
    timer = undefined;
    if (asked) {
      asked = false;
      run();
      open();
    }
  };

  const open = (): void => {
    timer = setTimeout(close, delayMs);
  };

  return {
    ask: (): void => {
      if (timer !== undefined) {
        asked = true;
        return;
      }
      run();
      open();
    },
    stop: (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = undefined;
      asked = false;
    },
  };
}

import type { ProjectState } from "@app/kernel/pipeline.js";
import {
  type NoticeSubject,
  type NoticeText,
  noticeOf,
  noticeText,
  type RunNotice,
} from "@app/slices/notifications/rules.js";

// Turns the global event stream's `project.state` frames into at most one browser notification
// per transition. The rule is the server's own (`slices/notifications/rules.ts`): only a run
// seen running can finish, fail or stop to wait, so a project that was already done when the
// page loaded says nothing.

export interface ShownNotice {
  readonly projectId: string;
  readonly kind: RunNotice;
  readonly text: NoticeText;
}

export interface RunWatcherDeps {
  // The toggle is on and the browser has granted permission.
  readonly enabled: () => boolean;
  // Every project's state now, so a run already going when the page loaded is known to be
  // running when it finishes.
  readonly seed: () => Promise<readonly { readonly id: string; readonly status: ProjectState }[]>;
  readonly subject: (projectId: string) => Promise<NoticeSubject | undefined>;
  // One tab of many wins each transition.
  readonly claim: (key: string) => Promise<boolean>;
  readonly show: (notice: ShownNotice) => void;
  readonly report: (error: unknown) => void;
}

export interface RunWatcher {
  readonly observe: (event: { readonly projectId: string; readonly state: ProjectState }) => void;
  // Fills in the projects no event has named yet; never overwrites one an event has.
  readonly seed: () => Promise<void>;
  // Resolves once every notification started so far is shown or dropped. Tests.
  readonly settled: () => Promise<void>;
}

export function createRunWatcher(deps: RunWatcherDeps): RunWatcher {
  const states = new Map<string, ProjectState>();
  const pending = new Set<Promise<void>>();

  const track = (work: Promise<void>): void => {
    const done = work
      .catch((error: unknown) => {
        deps.report(error);
      })
      .finally(() => {
        pending.delete(done);
      });
    pending.add(done);
  };

  const announce = async (projectId: string, state: ProjectState, kind: RunNotice) => {
    const subject = await deps.subject(projectId);
    if (subject === undefined) return;
    if (!(await deps.claim(`${projectId}:${state}`))) return;
    deps.show({ projectId, kind, text: noticeText(kind, subject) });
  };

  return {
    observe: (event) => {
      const previous = states.get(event.projectId);
      states.set(event.projectId, event.state);
      if (previous === event.state) return;
      const kind = noticeOf(previous, event.state);
      if (kind === undefined || !deps.enabled()) return;
      track(announce(event.projectId, event.state, kind));
    },
    seed: async () => {
      try {
        for (const project of await deps.seed())
          if (!states.has(project.id)) states.set(project.id, project.status);
      } catch (error) {
        deps.report(error);
      }
    },
    settled: async () => {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}

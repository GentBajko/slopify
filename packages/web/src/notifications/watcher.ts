import type { ProjectState, StageKind, StageState } from "@app/kernel/pipeline.js";
import {
  autoPassNoticeText,
  type NoticeCause,
  type NoticeSubject,
  type NoticeText,
  noticeOf,
  noticeText,
  type RunNotice,
  type RunNotices,
  reviewNoticeText,
  runNotices,
  topicsNoticeText,
} from "@app/slices/notifications/rules.js";

// Turns the global event stream's `project.state` frames into at most one browser notification
// per transition. The rule is the server's own (`slices/notifications/rules.ts`): only a run
// seen running or waiting can finish, fail or stop to wait, so a project that was already done
// when the page loaded says nothing.

export interface ShownNotice {
  readonly projectId: string;
  readonly kind: RunNotice;
  readonly text: NoticeText;
}

// "5 new topics are waiting for you": a schedule held the topics it suggested.
export interface ShownTopicsNotice {
  readonly scheduleId: string;
  readonly text: NoticeText;
}

export interface TopicsEvent {
  readonly scheduleId: string;
  readonly scheduleName: string;
  readonly added: number;
  readonly waiting: number;
}

// An automatic review kept an item flagged (`review.flagged`).
export interface ReviewEvent {
  readonly projectId: string;
  readonly verdictId: string;
  readonly stage: string;
  readonly reason?: string | undefined;
  readonly byAgent?: boolean | undefined;
}

// An external review passed at its deadline with no agent's verdict (`review.auto-passed`).
export interface AutoPassEvent {
  readonly projectId: string;
  readonly reviewId: string;
  readonly stage: string;
  readonly item?: string | undefined;
}

// "Started: Title": a run began.
export interface ShownStartNotice {
  readonly projectId: string;
  readonly title: string;
  readonly byAgent?: boolean | undefined;
}

export interface ShownReviewNotice {
  readonly projectId: string;
  readonly text: NoticeText;
}

// The failures each project's notices named (`runNotices`), only those it still has.
export interface ToldFailures {
  readonly read: (projectId: string) => ReadonlySet<string>;
  readonly write: (projectId: string, told: ReadonlySet<string>) => void;
}

// Kept for this page alone.
function toldInMemory(): ToldFailures {
  // ceiling: one entry per project with a failed step this page heard.
  const told = new Map<string, ReadonlySet<string>>();
  return {
    read: (projectId) => told.get(projectId) ?? new Set(),
    write: (projectId, now) => {
      if (now.size === 0) told.delete(projectId);
      else told.set(projectId, now);
    },
  };
}

export interface RunWatcherDeps {
  // The toggle is on and the browser has granted permission.
  readonly enabled: () => boolean;
  // Run sounds are on in this browser (`sounds.ts`).
  readonly sounds?: () => boolean;
  // Plays the start or the end chime.
  readonly play?: (sound: "start" | "end") => void;
  // A run started: shown with the start chime when browser notifications are on.
  readonly showStart?: (notice: ShownStartNotice) => void;
  // Every project's state now, so a run already going when the page loaded is known to be
  // running when it finishes.
  readonly seed: () => Promise<readonly { readonly id: string; readonly status: ProjectState }[]>;
  readonly subject: (projectId: string) => Promise<Omit<NoticeSubject, "reason"> | undefined>;
  // One tab of many wins each transition.
  readonly claim: (key: string) => Promise<boolean>;
  readonly show: (notice: ShownNotice) => void;
  readonly showTopics?: (notice: ShownTopicsNotice) => void;
  readonly showReview?: (notice: ShownReviewNotice) => void;
  readonly report: (error: unknown) => void;
  // Where told failures are kept: in the browser (`browser.ts` storedTold) so a reload or another
  // tab doesn't tell them again; this page's memory when left out.
  readonly told?: ToldFailures;
}

export interface RunWatcher {
  readonly observe: (event: { readonly projectId: string; readonly state: ProjectState }) => void;
  // A step reached a new state: one that failed while the run goes on is told right away.
  readonly observeStage: (event: {
    readonly projectId: string;
    readonly stage: StageKind;
    readonly state: StageState;
  }) => void;
  // A schedule held new suggested topics. Every tab hears it; one shows it.
  readonly observeTopics: (event: TopicsEvent) => void;
  // A review needs a decision. Every tab hears it; one shows it, once per verdict.
  readonly observeReview: (event: ReviewEvent) => void;
  // A review passed without an agent's verdict. Every tab hears it; one shows it, once.
  readonly observeAutoPass: (event: AutoPassEvent) => void;
  // Fills in the projects no event has named yet; never overwrites one an event has.
  readonly seed: () => Promise<void>;
  // Resolves once every notification started so far is shown or dropped. Tests.
  readonly settled: () => Promise<void>;
}

const ends: ReadonlySet<ProjectState> = new Set(["done", "partial", "failed", "canceled"]);

export function createRunWatcher(deps: RunWatcherDeps): RunWatcher {
  const states = new Map<string, ProjectState>();
  // The runs that have started and not ended, so a run that stops to wait for a review and
  // goes on is one start, not two.
  const started = new Set<string>();
  // ceiling: one id per auto-passed review this page heard.
  const autoPassed = new Set<string>();
  const sounding = (): boolean => deps.sounds?.() === true && deps.play !== undefined;
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

  const told = deps.told ?? toldInMemory();
  // `state` is the transition's, when a transition is the cause.
  const announce = async (projectId: string, cause: NoticeCause, state?: ProjectState) => {
    const subject = await deps.subject(projectId);
    if (subject === undefined) return;
    const now = runNotices(cause, subject, told.read(projectId));
    told.write(projectId, now.told);
    const notices: RunNotices["notices"][number][] = [];
    for (const one of now.notices)
      if (
        await deps.claim(
          one.kind === "step-failed"
            ? `${projectId}:step-failed:${now.news.join(",")}`
            : `${projectId}:${state ?? ""}`,
        )
      )
        notices.push(one);
    if (notices.length > 0 && sounding()) deps.play?.("end");
    if (deps.enabled())
      for (const one of notices)
        deps.show({
          projectId,
          kind: one.kind,
          text: noticeText(one.kind, { ...subject, reason: one.reason }),
        });
  };
  const announceStart = async (projectId: string) => {
    const subject = await deps.subject(projectId);
    if (subject === undefined) return;
    if (!(await deps.claim(`${projectId}:started`))) return;
    if (sounding()) deps.play?.("start");
    if (deps.enabled())
      deps.showStart?.({
        projectId,
        title: subject.title,
        ...(subject.startedBy === "agent" ? { byAgent: true } : {}),
      });
  };

  return {
    observe: (event) => {
      const previous = states.get(event.projectId);
      states.set(event.projectId, event.state);
      if (previous === event.state) return;
      const on = deps.enabled() || sounding();
      if (event.state === "running" && !started.has(event.projectId)) {
        started.add(event.projectId);
        if (sounding() || (deps.enabled() && deps.showStart !== undefined))
          track(announceStart(event.projectId));
        return;
      }
      if (ends.has(event.state)) started.delete(event.projectId);
      const kind = noticeOf(previous, event.state);
      if (kind === undefined || !on) return;
      track(announce(event.projectId, { kind }, event.state));
    },
    observeStage: (event) => {
      if (event.state !== "failed" || !(deps.enabled() || sounding())) return;
      track(announce(event.projectId, { stepFailed: event.stage }));
    },
    observeTopics: (event) => {
      if (event.added <= 0 || !deps.enabled() || deps.showTopics === undefined) return;
      const show = deps.showTopics;
      track(
        (async () => {
          if (!(await deps.claim(`topics:${event.scheduleId}:${String(event.waiting)}`))) return;
          show({ scheduleId: event.scheduleId, text: topicsNoticeText(event) });
        })(),
      );
    },
    observeReview: (event) => {
      if (!deps.enabled() || deps.showReview === undefined) return;
      const show = deps.showReview;
      track(
        (async () => {
          const subject = await deps.subject(event.projectId);
          if (subject === undefined) return;
          if (!(await deps.claim(`review:${event.verdictId}`))) return;
          show({
            projectId: event.projectId,
            text: reviewNoticeText({
              title: subject.title,
              stage: event.stage,
              reason: event.reason,
              ...(event.byAgent === true ? { byAgent: true } : {}),
            }),
          });
        })(),
      );
    },
    observeAutoPass: (event) => {
      if (autoPassed.has(event.reviewId) || !deps.enabled() || deps.showReview === undefined)
        return;
      autoPassed.add(event.reviewId);
      const show = deps.showReview;
      track(
        (async () => {
          const subject = await deps.subject(event.projectId);
          if (subject === undefined) return;
          if (!(await deps.claim(`auto-pass:${event.reviewId}`))) return;
          show({
            projectId: event.projectId,
            text: autoPassNoticeText({
              title: subject.title,
              stage: event.stage,
              item: event.item,
            }),
          });
        })(),
      );
    },
    seed: async () => {
      try {
        for (const project of await deps.seed())
          if (!states.has(project.id)) {
            states.set(project.id, project.status);
            // Already going when the page loaded: its start went by unheard.
            if (project.status === "running" || project.status === "paused")
              started.add(project.id);
          }
      } catch (error) {
        deps.report(error);
      }
    },
    settled: async () => {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}

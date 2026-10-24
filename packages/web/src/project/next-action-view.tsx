import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { CheckpointHold } from "@app/slices/reviews/holds.js";
import type { LimitWait } from "@app/slices/run-cost/panel.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactElement, type ReactNode, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout, type CalloutTone } from "@/components/kit/callout";
import { ariaKeyShortcuts } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { ButtonLink } from "@/components/kit/link";
import { copyText, SignInActions } from "@/fixes/fix-actions";
import { sentence } from "@/http";
import { shortcuts } from "@/lib/shortcuts";
import { copySample, fullVideoDraft } from "@/onboarding/api";
import { useOptionalPlaySession } from "@/play/draft-context";
import { keys } from "@/queries";
import { approveCheckpoint, type CheckpointGate, checkpointKey } from "./checkpoint-api.js";
import { ErrorDetails } from "./error-details.js";
import { fixOf } from "./fix-it.js";
import {
  type HeldGate,
  type NextAction,
  type NextIntent,
  nextActionFor,
  type OutdatedOutput,
  type SectionId,
} from "./next-action.js";
import type { RevisionController } from "./revision-workspace.js";
import { clockTime } from "./summary.js";
import type { ProjectActions } from "./use-actions.js";

// Where the next action is carried out: the title row's primary button, with one line under
// the title row where the situation needs saying, and the same action beside the thing it
// affects (a callout at the top of that section). `nextActionFor` decides; this only gathers
// its inputs from the page's queries and runs the intent it names.

export interface NextActionState {
  readonly next: NextAction | undefined;
  readonly run: (intent: NextIntent) => void;
  readonly pending: boolean;
  // What the last press said, when it did not work.
  readonly message: string | undefined;
}

export function useNextAction({
  project,
  stages,
  resumable,
  holding,
  sample,
  gates,
  outdated,
  waits,
  uploadReady,
  actions,
  controller,
  openSection,
  openUpload,
}: {
  readonly project: ProjectSummary;
  readonly stages: readonly Stage[];
  readonly resumable: boolean;
  // The checkpoints holding the run now (`ProjectBody.holding`).
  readonly holding: readonly CheckpointHold[];
  readonly sample: boolean;
  readonly gates: readonly CheckpointGate[];
  readonly outdated: readonly OutdatedOutput[];
  readonly waits: readonly LimitWait[];
  readonly uploadReady: boolean;
  readonly actions: ProjectActions;
  readonly controller: RevisionController;
  readonly openSection: (section: SectionId) => void;
  readonly openUpload: () => void;
}): NextActionState {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | undefined>();
  // One approval identity per gate and fingerprint, so a retried press after a lost answer
  // is the same request.
  const approval = useRef(new Map<string, string>());
  const held: HeldGate[] = gates
    // A gate holds the run once the run reaches it (`holding`, the server's rule), for the
    // person or, a schedule's own Before Video hold, for its day. A configured gate, or one
    // whose inputs changed, has nothing to look at yet.
    .filter(
      (gate) =>
        holding.some((hold) => hold.checkpointId === gate.checkpointId) &&
        gate.fingerprint === gate.currentFingerprint,
    )
    .map((gate) => ({
      checkpointId: gate.checkpointId,
      stage: gate.stage,
      dependents: gate.dependents,
    }));
  const next = nextActionFor({
    project,
    stages,
    resumable,
    sample,
    held,
    outdated,
    waits,
    uploadReady,
    fixOf: (stage) => fixOf(stage, project),
    clock: clockTime,
  });
  const copy = useMutation({
    mutationFn: () => copySample(api, project.id),
    onSuccess: async ({ projectId: copied }) => {
      await client.invalidateQueries({ queryKey: keys.projects });
      await navigate({ to: "/projects/$projectId", params: { projectId: copied } });
    },
    onError: (error) =>
      setMessage(
        `${sentence(error.message)} The copy was not made. Press Make my own copy to try again.`,
      ),
  });
  // One draft identity per project page, so a retried press opens the same draft.
  const fullDraft = useRef<string | null>(null);
  const session = useOptionalPlaySession();
  const full = useMutation({
    mutationFn: async () => {
      if (session === null) throw new Error("Create isn't available on this page. Reload the page");
      if (session.review.starting || session.review.uncertain || session.review.created !== null)
        throw new Error("Create is making a video from its open draft. Wait for it to start");
      if (!(await session.flush()))
        throw new Error(
          "The draft open in Create couldn't be saved. Open Create, save or discard it",
        );
      fullDraft.current ??= crypto.randomUUID();
      const { draft } = await fullVideoDraft(api, {
        projectId: project.id,
        draftId: fullDraft.current,
      });
      await client.invalidateQueries({ queryKey: keys.playDrafts });
      if (!(await session.open(draft.id)))
        throw new Error("The full video's draft was made but didn't open. Open Create and pick it");
      fullDraft.current = null;
      await navigate({ to: "/play" });
    },
    onError: (error) =>
      setMessage(`${sentence(error.message)} Then press Make the full video on this topic again.`),
  });
  const approve = useMutation({
    mutationFn: async (gate: HeldGate) => {
      const full = gates.find((one) => one.checkpointId === gate.checkpointId);
      if (full === undefined)
        throw new Error("The review changed before it was approved. Reload the page.");
      const key = `${full.checkpointId}:${full.fingerprint}`;
      const idempotencyKey = approval.current.get(key) ?? crypto.randomUUID();
      approval.current.set(key, idempotencyKey);
      const result = await approveCheckpoint(api, project.id, full.checkpointId, {
        revisionId: full.revisionId,
        fingerprint: full.fingerprint,
        idempotencyKey,
      });
      approval.current.delete(key);
      if (!result.ok) throw new Error(result.message);
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: checkpointKey(project.id) });
      await client.invalidateQueries({ queryKey: keys.project(project.id) });
      void client.invalidateQueries({ queryKey: keys.projects });
    },
    onError: (error) =>
      setMessage(
        `${sentence(error.message)} Press the approve button again to check whether it went through.`,
      ),
  });

  const run = (intent: NextIntent): void => {
    setMessage(undefined);
    switch (intent.kind) {
      case "copy-sample":
        copy.mutate();
        return;
      case "resume":
      case "pause":
        actions.run({ kind: intent.kind });
        return;
      case "retry":
      case "soften":
        actions.run({ kind: intent.kind, stage: intent.stage });
        return;
      // From the command palette: the command goes on the clipboard; Check again is the
      // button beside it on the page.
      case "sign-in":
        void copyText(intent.fix.command).then((copied) =>
          setMessage(
            copied
              ? `Copied ${intent.fix.command}. Run it in a terminal on the computer running Slopify, sign in, then press Check again.`
              : `Couldn't copy: the browser blocked the clipboard. Type ${intent.fix.command} in a terminal, sign in, then press Check again.`,
          ),
        );
        return;
      case "approve":
        approve.mutate(intent.gate);
        return;
      case "remake":
        controller.review({ kind: "selected", workKeys: intent.workKeys }, { autoStart: true });
        return;
      case "edit":
        openSection("settings");
        return;
      case "open-settings":
        void navigate({ to: "/settings", search: { section: intent.section } });
        return;
      case "prepare-upload":
        openUpload();
        return;
      case "full-video":
        full.mutate();
        return;
    }
  };
  const pending =
    copy.isPending || full.isPending || approve.isPending || actions.pending || controller.pending;
  return { next, run, pending, message };
}

// "Continuing…": the button's label while its own press is under way.
function busyLabel(intent: NextIntent): string | undefined {
  switch (intent.kind) {
    case "copy-sample":
      return "Copying…";
    case "resume":
      return "Continuing…";
    case "pause":
      return "Pausing…";
    case "approve":
      return "Approving…";
    case "remake":
      return "Checking the cost…";
    case "retry":
      return "Trying again…";
    case "soften":
      return "Softening…";
    case "full-video":
      return "Opening Create…";
    default:
      return undefined;
  }
}

function ActionButton({
  state,
  variant,
  className,
}: {
  readonly state: NextActionState;
  readonly variant: "primary" | "secondary";
  readonly className?: string;
}): ReactElement | null {
  const [softening, setSoftening] = useState(false);
  const action = state.next?.action;
  if (action === undefined) return null;
  const intent = action.intent;
  if (intent.kind === "sign-in")
    return (
      <SignInActions
        fix={intent.fix}
        variant={variant}
        retry={{
          run: () => state.run({ kind: "retry", stage: intent.stage }),
          busy: state.pending,
        }}
      />
    );
  if (intent.kind === "open-settings")
    return (
      <ButtonLink
        to="/settings"
        search={{ section: intent.section }}
        variant={variant}
        {...(className === undefined ? {} : { className })}
      >
        {action.label}
      </ButtonLink>
    );
  const label = state.pending ? (busyLabel(intent) ?? action.label) : action.label;
  return (
    <>
      <Button
        variant={variant}
        className={className}
        disabled={state.pending}
        disabledReason="Working on the last press"
        aria-keyshortcuts={
          variant === "primary" ? ariaKeyShortcuts(shortcuts.nextAction) : undefined
        }
        onClick={() => (intent.kind === "soften" ? setSoftening(true) : state.run(intent))}
      >
        {label}
      </Button>
      {intent.kind === "soften" ? (
        <ConfirmDialog
          open={softening}
          tone="primary"
          title="Soften the refused prompt and try again?"
          consequence="Your project's AI model rewrites each refused prompt without what a content filter could flag, keeping the scene and style. The image is then drawn again from the new wording, which it keeps as its prompt. The AI call and the new image are charged like any other."
          confirmLabel="Soften and retry"
          cancelLabel="Keep the prompt"
          pending={state.pending}
          onConfirm={() => {
            setSoftening(false);
            state.run(intent);
          }}
          onCancel={() => setSoftening(false)}
        />
      ) : null}
    </>
  );
}

// The project's next action as the title row's one primary button, named for its result.
export function NextActionButton({
  state,
}: {
  readonly state: NextActionState;
}): ReactElement | null {
  return <ActionButton state={state} variant="primary" />;
}

// The situations no section callout says and the title row's state word does not cover: the
// sample, a paused, stopped or queued run, a run parked on an agent, a finished short.
function noted(next: NextAction): boolean {
  if (next.situation === "running") return false;
  if (calloutTone[next.situation] !== undefined && next.section !== undefined) return false;
  return !(next.situation === "done" && next.action?.intent.kind === "prepare-upload");
}

// One line under the title row: what the situation is and what the button does, only where
// a person needs it, then what a press elsewhere on the page said when it did not work.
export function NextActionNote({
  state,
  feedback,
}: {
  readonly state: NextActionState;
  // A refused press from elsewhere on the page that belongs to the whole project.
  readonly feedback?: ReactNode;
}): ReactElement | null {
  const next = state.next;
  const line = next !== undefined && noted(next);
  if (!line && feedback === undefined && state.message === undefined) return null;
  return (
    <div className="sl-project__note">
      {line && next !== undefined ? (
        <p className="m-0">
          {next.title}
          {next.why === undefined ? null : ` ${next.why}`}
        </p>
      ) : null}
      {state.message === undefined ? null : (
        <p role="alert" className="m-0 text-danger">
          {state.message}
        </p>
      )}
      {feedback}
    </div>
  );
}

// A finished audiobook's next step, in the status column: its next chapter, set up in Create.
export function NextChapterOffer({
  nextChapter,
  primary,
}: {
  readonly nextChapter: {
    readonly run: () => void;
    readonly pending: boolean;
    readonly error?: string | undefined;
  };
  // The project has no other next action, so this is the page's one lime button.
  readonly primary: boolean;
}): ReactElement {
  return (
    <div className="flex flex-col items-start gap-1" {...helpScope}>
      <Button
        variant={primary ? "primary" : "secondary"}
        disabled={nextChapter.pending}
        disabledReason="Making the next chapter's draft"
        onClick={nextChapter.run}
      >
        {nextChapter.pending ? "Making the next chapter…" : "Make the next chapter"}
      </Button>
      <HelpLine>
        Opens Create set up for the next chapter with the same voices and settings. Nothing is made
        until you start it there.
      </HelpLine>
      {nextChapter.error === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {nextChapter.error}
        </p>
      )}
    </div>
  );
}

const calloutTone: Readonly<Record<NextAction["situation"], CalloutTone | undefined>> = {
  sample: undefined,
  paused: undefined,
  stopped: undefined,
  queued: undefined,
  running: undefined,
  failed: "danger",
  held: "waiting",
  waiting: "waiting",
  outdated: "info",
  // "Done" is in the title row with its button; repeating it above the section only pushes the
  // section down.
  done: undefined,
};

// The same action beside the thing it affects: at the top of the section it concerns, with
// the failed step's own words behind Error details.
export function NextActionBeside({
  state,
  section,
}: {
  readonly state: NextActionState;
  readonly section: SectionId;
}): ReactElement | null {
  const next = state.next;
  if (next === undefined || next.section !== section) return null;
  const tone = calloutTone[next.situation];
  if (tone === undefined) return null;
  return (
    <Callout
      tone={tone}
      title={next.title}
      {...(next.action === undefined
        ? {}
        : { actions: <ActionButton state={state} variant="secondary" /> })}
    >
      {next.why === undefined && next.detail === undefined ? undefined : (
        <>
          {next.why === undefined ? null : <span className="block">{next.why}</span>}
          {next.detail === undefined ? null : <ErrorDetails text={next.detail} />}
        </>
      )}
    </Callout>
  );
}

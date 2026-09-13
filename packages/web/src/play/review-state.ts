import type {
  DraftView,
  PlayDraftDocument,
  PlayReview,
  PlayStartInput,
  PlayStartResult,
} from "@app/slices/play-drafts/model.js";
import type { QueryClient } from "@tanstack/react-query";
import type { Api } from "@/api";
import { type DraftRefusal, readPlayDraft, reviewPlayDraft, startPlayDraft } from "./draft-api";
import { refreshDraftChoices, rememberDraft } from "./draft-restore";
import type { DraftSessionState } from "./draft-save";

export interface ReviewedGeneration {
  readonly draftId: string;
  readonly version: number;
  readonly editGeneration: number;
}
export function sameReviewedGeneration(
  reviewed: ReviewedGeneration | undefined,
  current: ReviewedGeneration,
): boolean {
  return (
    reviewed?.draftId === current.draftId &&
    reviewed.version === current.version &&
    reviewed.editGeneration === current.editGeneration
  );
}
export interface ReviewState {
  readonly receipt: PlayReview | null;
  readonly pending: boolean;
  readonly starting: boolean;
  readonly uncertain: boolean;
  readonly valid: boolean;
  readonly error: string | null;
  readonly fields: DraftRefusal["fields"];
  readonly created: PlayStartResult | null;
}
export interface ReviewOwner {
  readonly state: () => ReviewState;
  readonly invalidate: (clearFields?: boolean) => void;
  readonly restore: (view: DraftView) => void;
  readonly reset: () => void;
  readonly review: () => Promise<void>;
  readonly start: () => Promise<void>;
}
export function createReviewOwner({
  api,
  queryClient,
  current,
  flush,
  render,
}: {
  readonly api: Api;
  readonly queryClient: QueryClient;
  readonly current: () => DraftSessionState;
  readonly flush: () => Promise<boolean>;
  readonly render: () => void;
}): ReviewOwner {
  let state: ReviewState = {
    receipt: null,
    pending: false,
    starting: false,
    uncertain: false,
    valid: false,
    error: null,
    fields: [],
    created: null,
  };
  let reviewed: ReviewedGeneration | undefined;
  let epoch = 0;
  let reviewSequence = 0;
  let attempt: PlayStartInput | null = null;
  const publish = (patch: Partial<ReviewState>) => {
    state = { ...state, ...patch };
    render();
  };
  const identity = (): ReviewedGeneration => ({
    draftId: current().id ?? "",
    version: current().clock.version,
    editGeneration: current().clock.edited,
  });
  const valid = () =>
    sameReviewedGeneration(reviewed, identity()) &&
    current().clock.edited === current().clock.acknowledged;
  const invalidate = (clearFields = false) => {
    epoch++;
    reviewed = undefined;
    publish({ valid: false, ...(clearFields ? { fields: [], error: null } : {}) });
  };
  const refusal = (reply: DraftRefusal) =>
    publish({ error: reply.message, fields: reply.fields, valid: false });
  const complete = (created: PlayStartResult) => {
    attempt = null;
    publish({ created, uncertain: false, starting: false, valid: false });
  };
  const recover = async () => {
    const id = attempt?.draftId;
    if (!id) return;
    const reply = await readPlayDraft(api, id);
    if (!reply.ok) {
      refusal(reply);
      return;
    }
    if (reply.value.start) complete(reply.value.start);
  };
  const reset = () => {
    epoch++;
    reviewSequence++;
    reviewed = undefined;
    attempt = null;
    state = {
      receipt: null,
      pending: false,
      starting: false,
      uncertain: false,
      valid: false,
      error: null,
      fields: [],
      created: null,
    };
    render();
  };
  return {
    reset,
    state: () => ({ ...state, valid: state.valid && valid() }),
    invalidate,
    restore: (view) => {
      epoch++;
      reviewSequence++;
      reviewed = undefined;
      attempt = view.pendingStart
        ? {
            draftId: view.draft.id,
            baseVersion: view.pendingStart.draftVersion,
            reviewId: view.pendingStart.reviewId,
          }
        : null;
      state = {
        receipt: null,
        pending: false,
        starting: false,
        uncertain: attempt !== null,
        valid: false,
        error: null,
        fields: [],
        created: view.start,
      };
      render();
    },
    review: async () => {
      if (state.pending || state.starting || state.uncertain || state.created) return;
      const selected = ++reviewSequence;
      publish({ pending: true, valid: false, error: null, fields: [] });
      try {
        await Promise.all([
          refreshDraftChoices(api, queryClient),
          queryClient.refetchQueries({ queryKey: ["provider-models"] }),
        ]);
        if (selected !== reviewSequence || !(await flush()) || !current().id) return;
        const captured = identity();
        const generation = epoch;
        const reply = await reviewPlayDraft(api, {
          id: captured.draftId,
          baseVersion: captured.version,
        });
        if (
          selected !== reviewSequence ||
          generation !== epoch ||
          !sameReviewedGeneration(captured, identity())
        )
          return;
        if (!reply.ok) {
          refusal(reply);
          return;
        }
        if (
          reply.value.draftId !== captured.draftId ||
          reply.value.draftVersion !== captured.version
        )
          return;
        reviewed = captured;
        publish({ receipt: reply.value, valid: true });
      } catch (error) {
        if (selected === reviewSequence)
          publish({ error: error instanceof Error ? error.message : "Couldn't review this draft" });
      } finally {
        if (selected === reviewSequence) publish({ pending: false });
      }
    },
    start: async () => {
      if (state.starting || state.created || current().document.section !== "review") return;
      if (
        !attempt &&
        (!state.valid ||
          !valid() ||
          state.pending ||
          !state.receipt ||
          pendingReviewUpload(current().document, current().view) !== undefined)
      )
        return;
      if (!attempt && state.receipt)
        attempt = {
          draftId: state.receipt.draftId,
          baseVersion: state.receipt.draftVersion,
          reviewId: state.receipt.id,
        };
      if (!attempt) return;
      const input = attempt;
      rememberDraft(input.draftId);
      publish({ starting: true, error: null });
      try {
        if (state.uncertain) {
          await recover();
          if (state.created) return;
        }
        const reply = await startPlayDraft(api, input);
        if (reply.ok) {
          complete(reply.value);
          return;
        }
        if (reply.reason === "pending-start" || reply.reason === "already-started") {
          publish({ uncertain: true });
          await recover();
        } else {
          attempt = null;
          publish({ uncertain: false });
          refusal(reply);
        }
      } catch (error) {
        publish({
          uncertain: true,
          valid: false,
          error: `${error instanceof Error ? error.message : "Start response was lost"}. The result is uncertain. Check the same Start receipt before trying a new run.`,
        });
      } finally {
        publish({ starting: false });
      }
    },
  };
}

export function pendingReviewUpload(
  document: PlayDraftDocument,
  view: DraftView | null,
): string | undefined {
  if (document.fontUpload !== null) return "subtitles.fontUpload";
  const { sources, provided } = document.form;
  const active = [
    ...(sources.audio === "provide" && provided.audio
      ? [{ ref: provided.audio, field: "provided.audio" }]
      : []),
    ...(sources.thumbnail === "provide" && provided.thumbnail
      ? [{ ref: provided.thumbnail, field: "provided.thumbnail" }]
      : []),
    ...(sources.images === "provide"
      ? provided.images.map((ref, index) => ({ ref, field: `provided.images.${index}` }))
      : []),
  ];
  return active.find(
    ({ ref }) => view?.attachments.find((file) => file.id === ref.attachmentId)?.state !== "ready",
  )?.field;
}

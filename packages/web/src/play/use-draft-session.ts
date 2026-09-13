import type { DraftView, PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useRef } from "react";
import { useApp } from "@/app-context";
import type { DraftReply } from "./draft-api";
import {
  createPlayDraft,
  discardPlayDraft,
  forkPlayDraft,
  readPlayDraft,
  savePlayDraft,
} from "./draft-api";
import type { PlaySection, PlaySession } from "./draft-context";
import { refreshDraftChoices, rememberDraft, rememberedDraft } from "./draft-restore";
import {
  advanceSave,
  type DraftSessionState,
  emptySession,
  freezeSave,
  remapForkEdits,
  retainUploadSettlements,
} from "./draft-save";
import { createReviewOwner } from "./review-state";
import { useDraftUploads } from "./use-draft-uploads";
import { useReviewChoices } from "./use-review-choices";

export function useDraftSession(): PlaySession {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const [, render] = useReducer((value: number) => value + 1, 0);
  const state = useRef(emptySession());
  const owner = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Promise<boolean> | null = null;
    let drainRequested = false;
    let operation = 0;
    let forking = false;
    let alive = true;
    const publish = (patch: Partial<DraftSessionState>) => {
      state.current = { ...state.current, ...patch };
      if (alive) render();
    };
    const cancelTimer = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["play-drafts"] });
    };
    const fail = (error: unknown) => {
      publish({
        status: "error",
        error: error instanceof Error ? error.message : "Couldn't save draft",
      });
    };
    const accept = (
      reply: DraftReply<DraftView>,
    ): reply is { readonly ok: true; readonly value: DraftView } => {
      if (reply.ok) return true;
      publish({ status: reply.reason === "conflict" ? "conflict" : "error", error: reply.message });
      return false;
    };
    const install = (view: DraftView) => {
      review.restore(view);
      publish({
        ...emptySession(),
        document: view.draft.document,
        view,
        id: view.draft.id,
        clock: { edited: 0, acknowledged: 0, version: view.draft.version },
        status: "saved",
      });
      rememberDraft(view.draft.id);
      invalidate();
    };
    const drain = async (): Promise<boolean> => {
      const selected = operation;
      while (state.current.clock.edited > state.current.clock.acknowledged) {
        if (state.current.status === "conflict" || selected !== operation) return false;
        const current = state.current;
        const id = current.id ?? crypto.randomUUID();
        const pending =
          current.pending ?? freezeSave(current.document, current.clock, crypto.randomUUID());
        publish({ id, pending, status: "saving", error: null });
        try {
          const reply =
            pending.baseVersion === 0
              ? await createPlayDraft(api, { id, document: pending.document })
              : await savePlayDraft(api, {
                  id,
                  baseVersion: pending.baseVersion,
                  mutationId: pending.mutationId,
                  document: pending.document,
                });
          if (selected !== operation) return false;
          if (!accept(reply)) {
            if (reply.reason !== "conflict") publish({ pending: null });
            return false;
          }
          const clock = advanceSave(state.current.clock, {
            type: "acknowledge",
            generation: pending.generation,
            version: reply.value.draft.version,
          });
          publish({
            clock,
            view: {
              ...retainUploadSettlements(reply.value, state.current),
              review: clock.edited > clock.acknowledged ? null : reply.value.review,
            },
            pending: null,
            status: clock.edited > clock.acknowledged ? "unsaved" : "saved",
            error: null,
          });
          rememberDraft(id);
          invalidate();
          if (!drainRequested) return true;
        } catch (error) {
          if (selected === operation) fail(error);
          return false;
        }
      }
      return state.current.status !== "conflict" && state.current.status !== "error";
    };
    const begin = (): Promise<boolean> => {
      if (forking) return Promise.resolve(false);
      if (running) return running;
      if (state.current.clock.edited === state.current.clock.acknowledged)
        return Promise.resolve(true);
      running = drain().finally(() => {
        running = null;
      });
      return running;
    };
    const flush = (): Promise<boolean> => {
      cancelTimer();
      drainRequested = true;
      return begin();
    };
    const review = createReviewOwner({
      api,
      queryClient,
      current: () => state.current,
      flush,
      render: () => {
        if (alive) render();
      },
    });
    const edit = (document: PlayDraftDocument) => {
      if (review.state().starting || review.state().uncertain || review.state().created) return;
      review.invalidate(
        JSON.stringify({ ...document, section: state.current.document.section }) !==
          JSON.stringify(state.current.document),
      );
      const current = state.current;
      publish({
        document,
        clock: advanceSave(current.clock, { type: "edit" }),
        view: current.view ? { ...current.view, review: null } : null,
        status:
          current.status === "conflict" || current.status === "error" ? current.status : "unsaved",
      });
      cancelTimer();
      if (forking || current.status === "conflict" || current.status === "error") return;
      if (!current.id) {
        drainRequested = false;
        void begin();
      } else
        timer = setTimeout(() => {
          void flush();
        }, 500);
    };
    const open = async (id: string): Promise<void> => {
      if (review.state().starting || review.state().uncertain || review.state().created) return;
      if ((state.current.id !== id || state.current.status !== "conflict") && !(await flush()))
        return;
      const selected = ++operation;
      const generation = state.current.clock.edited;
      cancelTimer();
      try {
        const reply = await readPlayDraft(api, id);
        if (selected !== operation || generation !== state.current.clock.edited) return;
        if (!accept(reply)) {
          if (!state.current.id) publish({ recoveryId: id });
          return;
        }
        fork = null;
        install(reply.value);
        await refreshDraftChoices(api, queryClient);
      } catch (error) {
        if (selected === operation && generation === state.current.clock.edited) {
          fail(error);
          if (!state.current.id) publish({ recoveryId: id });
        }
      }
    };
    const newDraft = async (): Promise<void> => {
      if (review.state().starting || review.state().uncertain || review.state().created) return;
      const selected = operation;
      if (!(await flush()) || selected !== operation) return;
      operation++;
      fork = null;
      publish(emptySession());
      review.reset();
      rememberDraft(null);
    };
    const discard = async (): Promise<void> => {
      if (review.state().starting || review.state().uncertain || review.state().created) return;
      const selected = operation;
      if (!(await flush()) || selected !== operation) return;
      const { id, clock } = state.current;
      if (!id) return;
      try {
        const reply = await discardPlayDraft(api, { id, baseVersion: clock.version });
        if (selected !== operation || state.current.id !== id) return;
        if (!reply.ok) {
          publish({ error: reply.message });
          return;
        }
        operation++;
        fork = null;
        publish(emptySession());
        review.reset();
        rememberDraft(null);
        invalidate();
      } catch (error) {
        if (selected === operation) fail(error);
      }
    };
    let fork: {
      readonly sourceId: string;
      readonly id: string;
      readonly document: PlayDraftDocument;
      readonly generation: number;
    } | null = null;
    const saveAsNew = async (): Promise<void> => {
      if (review.state().starting || review.state().uncertain || review.state().created) return;
      cancelTimer();
      if (forking) return;
      if (running) await running;
      const current = state.current;
      if (!current.id || !current.view) {
        await flush();
        return;
      }
      const selected = operation;
      if (fork?.sourceId !== current.id) fork = null;
      fork ??= {
        sourceId: current.id,
        id: crypto.randomUUID(),
        document: freezeSave(current.document, current.clock, crypto.randomUUID()).document,
        generation: current.clock.edited,
      };
      const attempt = fork;
      forking = true;
      try {
        const reply = await forkPlayDraft(api, {
          sourceId: attempt.sourceId,
          id: attempt.id,
          document: attempt.document,
        });
        if (selected !== operation) return;
        if (!accept(reply)) return;
        const newer =
          state.current.clock.edited > attempt.generation ? state.current.document : null;
        operation++;
        install(reply.value);
        fork = null;
        forking = false;
        if (newer) edit(remapForkEdits(attempt.document, reply.value.draft.document, newer));
      } catch (error) {
        if (selected === operation) fail(error);
      } finally {
        forking = false;
      }
    };
    const navigate = async (section: PlaySection, field?: string): Promise<void> => {
      const selected = operation;
      const next = { ...state.current.document, section };
      if (state.current.id || state.current.clock.edited > 0) edit(next);
      else publish({ document: next });
      if (!(await flush()) || selected !== operation) return;
      publish({
        reveal: {
          section,
          ...(field === undefined ? {} : { field }),
          sequence: (state.current.reveal?.sequence ?? 0) + 1,
        },
      });
    };
    return {
      review,
      takeCreated: () => {
        const created = review.state().created;
        if (!created) return null;
        operation++;
        publish(emptySession());
        review.reset();
        rememberDraft(null);
        for (const key of [["projects"], ["staging"], ["play-drafts"]])
          void queryClient.invalidateQueries({ queryKey: key });
        return created;
      },
      edit,
      flush,
      open,
      newDraft,
      discard,
      saveAsNew,
      navigate,
      generation: () => operation,
      publish,
      start: () => {
        alive = true;
        const id = rememberedDraft();
        if (id) void open(id);
      },
      stop: () => {
        alive = false;
        cancelTimer();
      },
    };
  }, [api, queryClient]);
  useEffect(() => {
    owner.start();
    return owner.stop;
  }, [owner]);
  useReviewChoices(api, queryClient, owner.review);
  const uploads = useDraftUploads({
    api,
    queryClient,
    state,
    edit: owner.edit,
    flush: owner.flush,
    generation: owner.generation,
    publish: owner.publish,
    render,
  });
  const current = state.current;
  return {
    ...uploads,
    review: owner.review.state(),
    reviewDraft: owner.review.review,
    startRun: owner.review.start,
    invalidateReview: owner.review.invalidate,
    takeCreated: owner.takeCreated,
    document: current.document,
    section: current.document.section,
    view: current.view,
    status: current.status,
    error: current.error,
    edited: current.clock.edited,
    acknowledged: current.clock.acknowledged,
    reveal: current.reveal,
    edit: owner.edit,
    flush: owner.flush,
    open: owner.open,
    newDraft: owner.newDraft,
    discard: owner.discard,
    saveAsNew: owner.saveAsNew,
    navigate: owner.navigate,
    activeId: current.id ?? current.recoveryId,
  };
}

import { pickerEntries } from "@app/slices/model-checks/rules.js";
import type { DraftView, PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { type ProviderFamily, systemVoiceProvider } from "@app/slices/settings/model.js";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { readFirstRun, upkeepKeys } from "@/components/provider-upkeep-api";
import { modelsQuery } from "@/lib/models";
import { keys, providersQuery, voicesQuery } from "@/queries";
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
  servicesOf,
} from "./draft-save";
import {
  type FreshProviderDefaults,
  setFreshProviderDefaults,
  setReadyServices,
  templateProviderDefaults,
  withProviderDefaults,
} from "./draft-state";
import { readiness } from "./problems";
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
    let discardingId: string | null = null;
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
      void queryClient.invalidateQueries({ queryKey: keys.playDrafts });
    };
    const fail = (error: unknown) => {
      publish({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Your latest changes weren't saved. Keep this page open and try again.",
      });
    };
    const accept = (
      reply: DraftReply<DraftView>,
    ): reply is { readonly ok: true; readonly value: DraftView } => {
      if (reply.ok) return true;
      publish({ status: reply.reason === "conflict" ? "conflict" : "error", error: reply.message });
      return false;
    };
    // The remembered draft `start` is reopening, which says so once it is on the page.
    let restoring: string | null = null;
    // While true, the fresh form is not saved yet: the starter template is on its way and
    // will replace it, taking the typed topic along, so no blank draft is left behind.
    let holding = false;
    const install = (view: DraftView) => {
      review.restore(view);
      publish({
        ...emptySession(),
        document: view.draft.document,
        view,
        id: view.draft.id,
        clock: { edited: 0, acknowledged: 0, version: view.draft.version },
        status: "saved",
        // A draft the template just made (its first version) takes the found services.
        fillServices: view.draft.version === 1 && view.draft.document.templateSource !== undefined,
        ...(restoring === view.draft.id
          ? { restored: { id: view.draft.id, updatedAt: view.draft.updatedAt } }
          : {}),
      });
      rememberDraft(view.draft.id);
      invalidate();
    };
    const drain = async (): Promise<boolean> => {
      const selected = operation;
      while (state.current.clock.edited > state.current.clock.acknowledged) {
        if (
          state.current.status === "conflict" ||
          selected !== operation ||
          (discardingId !== null && discardingId === state.current.id)
        )
          return false;
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
      if (holding && state.current.id === null) return Promise.resolve(true);
      if (discardingId !== null && discardingId === state.current.id) return Promise.resolve(false);
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
      resave: () => edit(state.current.document),
      render: () => {
        if (alive) render();
      },
    });
    // True while the found services are being written in, which is not the person's pick.
    let filling = false;
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
        fillServices:
          current.fillServices &&
          (filling || servicesOf(document) === servicesOf(current.document)),
      });
      cancelTimer();
      if (
        forking ||
        (discardingId !== null && discardingId === current.id) ||
        current.status === "conflict" ||
        current.status === "error"
      )
        return;
      if (!current.id) {
        drainRequested = false;
        void begin();
      } else
        timer = setTimeout(() => {
          void flush();
        }, 500);
    };
    // The fresh form and a draft just made from a template get the writer, voice and image
    // service the first launch found, else the ones whose key is saved, wherever none is picked
    // yet, and keep them: they are saved with it. What arrives late (the model lists answer
    // after the person started typing the topic) still fills what is empty, until the person
    // picks a service in that draft. The fresh form untouched is filled without being saved.
    const fillServices = (defaults?: FreshProviderDefaults) => {
      const current = state.current;
      if (!current.fillServices) return;
      const document = withProviderDefaults(current.document, templateProviderDefaults(defaults));
      if (document === current.document) return;
      if (current.id === null && current.clock.edited === 0) {
        publish({ document });
        return;
      }
      filling = true;
      try {
        edit(document);
      } finally {
        filling = false;
      }
    };
    // `carry` takes along what was typed in the draft being left (the topic) into the one
    // opened: what is typed while the opened draft is read is then kept rather than lost, and
    // does not stop it from opening.
    const open = async (
      id: string,
      isCurrent: () => boolean = () => true,
      carry?: (typed: PlayDraftDocument, opened: PlayDraftDocument) => PlayDraftDocument,
    ): Promise<boolean> => {
      if (review.state().starting || review.state().uncertain || review.state().created)
        return false;
      if ((state.current.id !== id || state.current.status !== "conflict") && !(await flush()))
        return false;
      if (!isCurrent()) return false;
      const selected = ++operation;
      const generation = state.current.clock.edited;
      cancelTimer();
      try {
        const reply = await readPlayDraft(api, id);
        if (selected !== operation || !isCurrent()) return false;
        if (generation !== state.current.clock.edited && carry === undefined) return false;
        if (!accept(reply)) {
          if (!state.current.id) publish({ recoveryId: id });
          return false;
        }
        // A save of the draft being left that typing started meanwhile lands before the
        // opened one takes the page; nothing is awaited between reading the typed text and
        // installing, so no keystroke falls between them.
        while (running) await running;
        if (selected !== operation || !isCurrent()) return false;
        cancelTimer();
        const typed = state.current.document;
        fork = null;
        install(reply.value);
        if (carry !== undefined) {
          const carried = carry(typed, reply.value.draft.document);
          if (carried !== reply.value.draft.document) edit(carried);
        }
        fillServices();
        await refreshDraftChoices(api, queryClient);
        return isCurrent();
      } catch (error) {
        if (selected === operation && generation === state.current.clock.edited) {
          fail(error);
          if (!state.current.id) publish({ recoveryId: id });
        }
        return false;
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
    const discard: PlaySession["discard"] = async ({ id, version }) => {
      if (review.state().starting || review.state().uncertain || review.state().created)
        throw new Error("Resolve the pending Start before discarding a draft");
      if (forking || discardingId !== null)
        throw new Error("Wait for the current draft operation before discarding");
      const selected = operation;
      discardingId = id;
      if ((state.current.id ?? state.current.recoveryId) === id) cancelTimer();
      try {
        if (running) await running;
        const reply = await discardPlayDraft(api, { id, baseVersion: version });
        if (!reply.ok && reply.reason !== "not-found") throw new Error(reply.message);
        invalidate();
        if (selected !== operation || (state.current.id ?? state.current.recoveryId) !== id) return;
        cancelTimer();
        operation++;
        fork = null;
        publish(emptySession());
        review.reset();
        rememberDraft(null);
      } finally {
        discardingId = null;
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
      if (forking || discardingId !== null) return;
      if (running) await running;
      const current = state.current;
      if (!current.id || (!current.view && current.status !== "conflict")) {
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
        if (!accept(reply)) {
          if (reply.reason === "conflict") fork = null;
          return;
        }
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
    const navigate = async (
      section: PlaySection,
      field?: string,
      options?: { readonly reveal?: boolean },
    ): Promise<void> => {
      const selected = operation;
      const next = { ...state.current.document, section };
      if (state.current.id || state.current.clock.edited > 0) edit(next);
      else publish({ document: next });
      if (!(await flush()) || selected !== operation || options?.reveal === false) return;
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
        for (const key of [["projects"], ["staging"], keys.playDrafts])
          void queryClient.invalidateQueries({ queryKey: key });
        return created;
      },
      edit,
      flush,
      open,
      newDraft,
      // Defaults that arrive after Create opened fill what is still empty in the fresh form or
      // in a draft just made from a template (see fillServices).
      adoptDefaults: fillServices,
      // Holds the fresh form's first save while the starter template is on its way; let go,
      // what was typed meanwhile is saved.
      holdFresh: (hold: boolean) => {
        if (holding === hold) return;
        holding = hold;
        const current = state.current;
        if (hold || current.id !== null || current.clock.edited === current.clock.acknowledged)
          return;
        drainRequested = false;
        void begin();
      },
      // The channel picked in the sidebar becomes a fresh draft's channel, the same way and with
      // the same guard: a draft somebody typed in, opened or made from a template keeps its own.
      adoptChannel: (channelId: string) => {
        const current = state.current;
        if (current.id !== null || current.clock.edited > 0 || current.view !== null) return;
        const document = current.document;
        if (document.channelId !== undefined || document.templateSource !== undefined) return;
        publish({ document: { ...document, channelId } });
      },
      discard,
      saveAsNew,
      navigate,
      generation: () => operation,
      publish,
      start: () => {
        alive = true;
        const id = rememberedDraft();
        if (!id) return;
        restoring = id;
        void open(id).finally(() => {
          restoring = null;
        });
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
    restored: current.restored?.id === current.id ? current.restored : undefined,
    edit: owner.edit,
    flush: owner.flush,
    open: owner.open,
    generation: owner.generation,
    newDraft: owner.newDraft,
    adoptDefaults: owner.adoptDefaults,
    holdFresh: owner.holdFresh,
    adoptChannel: owner.adoptChannel,
    discard: owner.discard,
    saveAsNew: owner.saveAsNew,
    navigate: owner.navigate,
    activeId: current.id ?? current.recoveryId,
  };
}

// The writer and image service this machine's first launch found, read once and handed to the
// session: the fresh form and a draft just made from a template start with them picked. For a
// kind the first launch found nothing of, they take the first service of that kind that
// answers (a key saved in Settings, a tool installed), with its first listed model. A draft
// whose voice service can't read here takes a saved voice of one that can (a keyed service
// first, the computer's own voice last), with that service's first model. True once every
// answer (or a failure) has arrived and the session has taken them, so what Create decides on
// arrival (which row opens) reads the draft with them filled in.
export function useFirstRunDefaults(session: Pick<PlaySession, "adoptDefaults">): boolean {
  const { api } = useApp();
  const status = useQuery({
    queryKey: upkeepKeys.firstRun,
    queryFn: () => readFirstRun(api),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const providers = useQuery(providersQuery(api));
  const voices = useQuery(voicesQuery(api));
  const found = status.data?.defaults;
  const known =
    (status.isSuccess || status.isError) &&
    (providers.isSuccess || providers.isError) &&
    (voices.isSuccess || voices.isError);
  const readyOf = (family: ProviderFamily): string | undefined =>
    providers.data?.providers.find(
      (provider) => provider.family === family && readiness(provider).ok,
    )?.id;
  const voiceServices = (providers.data?.providers ?? [])
    .filter((provider) => provider.family === "tts" && readiness(provider).ok)
    .map((provider) => provider.id);
  const readable = (voices.data?.voices ?? []).filter((voice) =>
    voiceServices.includes(voice.provider),
  );
  const voice = known
    ? (readable.find((one) => one.provider !== systemVoiceProvider) ?? readable[0])
    : undefined;
  const spare = {
    llm: known && found?.llm === undefined ? readyOf("llm") : undefined,
    images: known && found?.images === undefined ? readyOf("image") : undefined,
    audio: voice?.provider,
  };
  const asked = [spare.llm, spare.images, spare.audio].filter((id) => id !== undefined);
  const lists = useQueries({
    queries: asked.map((provider) => ({
      ...modelsQuery(api, provider),
      refetchInterval: false as const,
    })),
  });
  const settled = known && lists.every((list) => list.isSuccess || list.isError);
  const choice = (provider: string | undefined) => {
    if (provider === undefined) return undefined;
    const list = lists[asked.indexOf(provider)]?.data;
    if (list === undefined) return undefined;
    const model = pickerEntries(list.models, list.standings, "", list.standings === undefined)
      .entries[0]?.model.id;
    return model === undefined ? undefined : { provider, model };
  };
  const reader = choice(spare.audio);
  // One hand-over once everything is known, so a draft is filled once, with all of it.
  const handOver = settled
    ? JSON.stringify({
        found: found ?? {},
        ready: {
          llm: choice(spare.llm),
          images: choice(spare.images),
          ...(reader === undefined || voice === undefined
            ? {}
            : { audio: { ...reader, voice: voice.voiceId }, voiceServices }),
        },
      })
    : undefined;
  const { adoptDefaults } = session;
  const [taken, setTaken] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (handOver === undefined) return;
    const { found, ready } = JSON.parse(handOver) as {
      readonly found: FreshProviderDefaults;
      readonly ready: FreshProviderDefaults;
    };
    setReadyServices(ready);
    setFreshProviderDefaults(found);
    adoptDefaults?.(found);
    setTaken(handOver);
  }, [handOver, adoptDefaults]);
  return settled && taken === handOver;
}

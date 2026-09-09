import type { PromptDraft } from "@app/slices/library/model.js";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { freshForm, type PlayFormState } from "@/play/state";

type PromptUpdate = SetStateAction<PromptDraft | undefined>;

interface FormDrafts {
  readonly prompts: ReadonlyMap<string, PromptDraft>;
  readonly updatePrompt: (key: string, update: PromptUpdate) => void;
  readonly play: PlayFormState;
  readonly updatePlay: Dispatch<SetStateAction<PlayFormState>>;
}

const DraftsContext = createContext<FormDrafts | undefined>(undefined);

// Forms survive in-app navigation for this tab's lifetime. Nothing is serialized,
// and API-key fields never use this provider. Keeping the Play updater here also
// lets an upload finish while its page is unmounted.
export function FormDraftsProvider({ children }: { readonly children: ReactNode }) {
  const [prompts, setPrompts] = useState<ReadonlyMap<string, PromptDraft>>(() => new Map());
  const [play, updatePlay] = useState<PlayFormState>(freshForm);
  const updatePrompt = useCallback((key: string, update: PromptUpdate) => {
    setPrompts((previous) => {
      const before = previous.get(key);
      const after = typeof update === "function" ? update(before) : update;
      if (before === after) return previous;
      const next = new Map(previous);
      if (after === undefined) next.delete(key);
      else next.set(key, after);
      return next;
    });
  }, []);
  const value = useMemo(
    () => ({ prompts, updatePrompt, play, updatePlay }),
    [prompts, updatePrompt, play],
  );
  return <DraftsContext.Provider value={value}>{children}</DraftsContext.Provider>;
}

export function usePromptDraft(
  key: string,
): readonly [PromptDraft | undefined, Dispatch<PromptUpdate>] {
  const context = useContext(DraftsContext);
  const [local, setLocal] = useState<PromptDraft | undefined>(undefined);
  const updatePrompt = context?.updatePrompt;
  const update = useCallback(
    (next: PromptUpdate) => {
      if (updatePrompt) updatePrompt(key, next);
      else setLocal(next);
    },
    [key, updatePrompt],
  );
  return [context ? context.prompts.get(key) : local, update];
}

export function usePlayDraft(): readonly [PlayFormState, Dispatch<SetStateAction<PlayFormState>>] {
  const context = useContext(DraftsContext);
  const [local, setLocal] = useState<PlayFormState>(freshForm);
  return context ? [context.play, context.updatePlay] : [local, setLocal];
}

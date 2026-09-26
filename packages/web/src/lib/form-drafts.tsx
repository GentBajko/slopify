import { sourceOf } from "@app/slices/admission/model.js";
import { documentThemeOf } from "@app/slices/document/model.js";
import type { PromptDraft } from "@app/slices/library/model.js";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { usePlaySession } from "@/play/draft-context";
import type { PlayFormState, Upload } from "@/play/state";

type PromptUpdate = SetStateAction<PromptDraft | undefined>;

interface FormDrafts {
  readonly prompts: ReadonlyMap<string, PromptDraft>;
  readonly updatePrompt: (key: string, update: PromptUpdate) => void;
}

const DraftsContext = createContext<FormDrafts | undefined>(undefined);

export function FormDraftsProvider({ children }: { readonly children: ReactNode }) {
  const [prompts, setPrompts] = useState<ReadonlyMap<string, PromptDraft>>(() => new Map());
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
  const value = useMemo(() => ({ prompts, updatePrompt }), [prompts, updatePrompt]);
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

function typedNumber(raw: string): number {
  return raw.trim() === "" ? Number.NaN : Number(raw);
}

export function usePlayDraft(): readonly [PlayFormState, Dispatch<SetStateAction<PlayFormState>>] {
  const session = usePlaySession();
  const current = useRef(session);
  current.current = session;
  const form = session.document.form;
  const upload = (ref: typeof form.provided.audio): Upload | undefined => {
    if (!ref) return undefined;
    const attachment = session.view?.attachments.find((one) => one.id === ref.attachmentId);
    const file =
      attachment?.state === "ready" && attachment.stagedFileId
        ? {
            id: attachment.stagedFileId,
            stageKind: attachment.kind,
            path: attachment.stagedFileId,
            originalFilename: attachment.name,
            bytes: attachment.bytes,
            state: "staged" as const,
            createdAt: session.view?.draft.createdAt ?? "",
          }
        : undefined;
    return {
      key: ref.attachmentId,
      name: ref.name,
      file,
      error:
        attachment?.error ??
        (attachment?.state === "reattach" ||
        (!file && !session.attachmentUploading(ref.attachmentId))
          ? "Reattach this file"
          : undefined),
    };
  };
  const legacy: PlayFormState = {
    ...form,
    sources: { ...form.sources, document: sourceOf(form.sources, "document") },
    document: {
      theme: documentThemeOf(form.document),
      ...(form.document?.custom === undefined ? {} : { custom: form.document.custom }),
    },
    imagePrompts: form.imagePrompts.map((one) => ({ ...one, number: Number(one.number) })),
    chunking:
      form.chunking.mode === "words"
        ? {
            mode: "words",
            ...(form.chunking.words === "" ? {} : { words: Number(form.chunking.words) }),
          }
        : form.chunking.mode === "characters"
          ? {
              mode: "characters",
              ...(form.chunking.characters === ""
                ? {}
                : { characters: Number(form.chunking.characters) }),
            }
          : { mode: form.chunking.mode },
    subtitles: { ...form.subtitles, fontSize: Number(form.subtitles.fontSize) },
    imageSeconds: typedNumber(form.imageSeconds),
    edgeSilenceSeconds: typedNumber(form.edgeSilenceSeconds),
    zoomPercent: typedNumber(form.zoomPercent),
    provided: {
      ...form.provided,
      audio: upload(form.provided.audio),
      thumbnail: upload(form.provided.thumbnail),
      images: form.provided.images.flatMap((ref) => {
        const one = upload(ref);
        return one ? [one] : [];
      }),
    },
  };
  const latest = useRef(legacy);
  latest.current = legacy;
  const update = useCallback((action: SetStateAction<PlayFormState>) => {
    const before = current.current.document;
    const next = typeof action === "function" ? action(latest.current) : action;
    latest.current = next;
    const rawNumber = (value: number | undefined, raw: string) =>
      value === undefined ? "" : Object.is(value, Number(raw)) ? raw : String(value);
    const ref = (one: Upload | undefined) =>
      one ? { attachmentId: one.key, name: one.name } : null;
    // A draft saved before the Document stage keeps both fields absent until one is changed.
    const { document: documentSource, ...otherSources } = next.sources;
    const { document: documentSettings, ...rest } = next;
    const keepSource = before.form.sources.document !== undefined || documentSource !== "off";
    const keepSettings =
      before.form.document !== undefined ||
      documentSettings.theme !== documentThemeOf(before.form.document) ||
      documentSettings.custom !== undefined;
    current.current.edit({
      ...before,
      form: {
        ...rest,
        sources: keepSource ? next.sources : otherSources,
        ...(keepSettings ? { document: documentSettings } : {}),
        imagePrompts: next.imagePrompts.map((one) => ({
          ...one,
          number: rawNumber(
            one.number,
            before.form.imagePrompts.find((saved) => saved.name === one.name)?.number ??
              String(one.number),
          ),
        })),
        chunking: {
          ...before.form.chunking,
          mode: next.chunking.mode,
          ...(next.chunking.mode === "words"
            ? { words: rawNumber(next.chunking.words, before.form.chunking.words) }
            : {}),
          ...(next.chunking.mode === "characters"
            ? { characters: rawNumber(next.chunking.characters, before.form.chunking.characters) }
            : {}),
        },
        subtitles: {
          ...before.form.subtitles,
          ...next.subtitles,
          fontSize: rawNumber(next.subtitles.fontSize, before.form.subtitles.fontSize),
        },
        // What was typed stays, unless something else set a different number.
        imageSeconds: Object.is(next.imageSeconds, typedNumber(before.form.imageSeconds))
          ? before.form.imageSeconds
          : String(next.imageSeconds),
        edgeSilenceSeconds: Object.is(
          next.edgeSilenceSeconds,
          typedNumber(before.form.edgeSilenceSeconds),
        )
          ? before.form.edgeSilenceSeconds
          : String(next.edgeSilenceSeconds),
        zoomPercent: Object.is(next.zoomPercent, typedNumber(before.form.zoomPercent))
          ? before.form.zoomPercent
          : String(next.zoomPercent),
        provided: {
          ...next.provided,
          audio: ref(next.provided.audio),
          thumbnail: ref(next.provided.thumbnail),
          images: next.provided.images.map((one) => ({ attachmentId: one.key, name: one.name })),
        },
      },
    });
  }, []);
  return [legacy, update];
}

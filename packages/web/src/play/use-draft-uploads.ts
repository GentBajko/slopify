import type { DraftAttachment, PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { QueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef } from "react";
import type { Api } from "@/api";
import { fontsKey, uploadFont } from "@/subtitles/api";
import { uploadPlayDraftAttachment } from "./draft-api";
import type { PlaySession } from "./draft-context";
import type { DraftSessionState } from "./draft-save";
import { sameUploadOwner, type UploadOwner } from "./draft-uploads";

export function useDraftUploads({
  api,
  queryClient,
  state,
  edit,
  flush,
  generation,
  publish,
  render,
}: {
  readonly api: Api;
  readonly queryClient: QueryClient;
  readonly state: RefObject<DraftSessionState>;
  readonly edit: (document: PlayDraftDocument) => void;
  readonly flush: () => Promise<boolean>;
  readonly generation: () => number;
  readonly publish: (patch: Partial<DraftSessionState>) => void;
  readonly render: () => void;
}): Pick<
  PlaySession,
  | "attachmentUploading"
  | "attach"
  | "selectFont"
  | "uploadSubtitleFont"
  | "fontUploading"
  | "fontUpload"
> {
  const lifetime = useRef(0);
  const fontOperation = useRef<string | null>(null);
  const fontError = useRef<{ operationId: string; message: string } | null>(null);
  const reservations = useRef(new Map<string, number>());
  const operations = useRef(
    new Map<string, { owner: UploadOwner; controller: AbortController; generation: number }>(),
  );
  const owns = (sent: UploadOwner): boolean => {
    const provided = state.current.document.form.provided;
    const ref = [provided.audio, provided.thumbnail, ...provided.images].find(
      (one) => one?.attachmentId === sent.attachmentId,
    );
    return sameUploadOwner(
      ref && state.current.id
        ? { draftId: state.current.id, attachmentId: ref.attachmentId }
        : undefined,
      sent,
    );
  };
  useEffect(() => {
    for (const [id, selected] of reservations.current)
      if (selected !== generation()) reservations.current.delete(id);
    for (const [id, operation] of operations.current) {
      if (!owns(operation.owner) || operation.generation !== generation()) {
        operation.controller.abort();
        operations.current.delete(id);
      }
    }
  });
  useEffect(() => {
    const pending = operations.current;
    const reserved = reservations.current;
    return () => {
      lifetime.current++;
      reserved.clear();
      for (const operation of pending.values()) operation.controller.abort();
      pending.clear();
    };
  }, []);
  const attach = async (
    kind: DraftAttachment["kind"],
    files: readonly File[],
    replaceId?: string,
  ): Promise<void> => {
    if (files.length === 0) return;
    const selectedFiles = kind === "images" && !replaceId ? files : files.slice(-1);
    const refs = selectedFiles.map((file) => ({
      attachmentId: crypto.randomUUID(),
      name: file.name,
    }));
    const selectedLifetime = lifetime.current;
    const selected = generation();
    for (const ref of refs) reservations.current.set(ref.attachmentId, selected);
    const current = state.current.document;
    const provided = current.form.provided;
    edit({
      ...current,
      form: {
        ...current.form,
        provided:
          kind === "images"
            ? {
                ...provided,
                images: replaceId
                  ? provided.images.flatMap((ref) =>
                      ref.attachmentId === replaceId ? refs : [ref],
                    )
                  : [...provided.images, ...refs],
              }
            : { ...provided, [kind]: refs.at(-1) ?? null },
      },
    });
    const saved = await flush();
    for (const ref of refs) reservations.current.delete(ref.attachmentId);
    if (!saved || selected !== generation() || selectedLifetime !== lifetime.current) {
      render();
      return;
    }
    const id = state.current.id;
    if (!id) return;
    await Promise.all(
      refs.map(async (ref, index) => {
        const file = selectedFiles[index];
        const sent = { draftId: id, attachmentId: ref.attachmentId };
        if (!file || !owns(sent)) return;
        const controller = new AbortController();
        operations.current.set(ref.attachmentId, { owner: sent, controller, generation: selected });
        const settle = (attachment: DraftAttachment) => {
          const view = state.current.view;
          if (
            selected !== generation() ||
            selectedLifetime !== lifetime.current ||
            view?.draft.id !== id
          )
            return;
          if (!owns(sent) || controller.signal.aborted) return;
          publish({
            view: {
              ...view,
              review: null,
              attachments: [
                ...view.attachments.filter((one) => one.id !== ref.attachmentId),
                attachment,
              ],
            },
          });
        };
        try {
          const reply = await uploadPlayDraftAttachment(
            api,
            id,
            ref.attachmentId,
            file,
            controller.signal,
          );
          if (reply.ok) settle(reply.value);
          else
            settle({
              id: ref.attachmentId,
              kind,
              name: ref.name,
              state: "reattach",
              stagedFileId: null,
              bytes: 0,
              error: reply.message,
            });
        } catch (error) {
          settle({
            id: ref.attachmentId,
            kind,
            name: ref.name,
            state: "reattach",
            stagedFileId: null,
            bytes: 0,
            error: error instanceof Error ? error.message : "Reattach this file",
          });
        } finally {
          operations.current.delete(ref.attachmentId);
        }
      }),
    );
  };
  const selectFont = (fontId: string): void => {
    fontOperation.current = null;
    const document = state.current.document;
    edit({
      ...document,
      fontUpload: null,
      form: { ...document.form, subtitles: { ...document.form.subtitles, fontId } },
    });
  };
  const uploadSubtitleFont = async (file: File): Promise<void> => {
    const operationId = crypto.randomUUID();
    fontOperation.current = operationId;
    edit({ ...state.current.document, fontUpload: { operationId, name: file.name } });
    const selectedLifetime = lifetime.current;
    const selected = generation();
    if (!(await flush()) || selected !== generation() || selectedLifetime !== lifetime.current) {
      if (fontOperation.current === operationId) fontOperation.current = null;
      render();
      return;
    }
    if (state.current.document.fontUpload?.operationId !== operationId) return;
    try {
      const { font } = await uploadFont(api, file);
      if (
        selected !== generation() ||
        selectedLifetime !== lifetime.current ||
        state.current.document.fontUpload?.operationId !== operationId
      )
        return;
      queryClient.setQueryData<{
        readonly fonts: readonly import("@/subtitles/api").FontSummary[];
      }>(fontsKey, (before) => ({
        fonts: [...(before?.fonts ?? []).filter((one) => one.id !== font.id), font],
      }));
      selectFont(font.id);
      await flush();
    } catch (error) {
      if (
        selected === generation() &&
        selectedLifetime === lifetime.current &&
        state.current.document.fontUpload?.operationId === operationId
      ) {
        fontError.current = {
          operationId,
          message: error instanceof Error ? error.message : "Reattach this font",
        };
        render();
      }
    } finally {
      if (fontOperation.current === operationId) {
        fontOperation.current = null;
        render();
      }
    }
  };
  const fontUploading =
    fontOperation.current !== null &&
    fontOperation.current === state.current.document.fontUpload?.operationId;
  return {
    attachmentUploading: (id) => {
      const operation = operations.current.get(id);
      return (
        reservations.current.get(id) === generation() ||
        (operation !== undefined &&
          operation.generation === generation() &&
          owns(operation.owner) &&
          !operation.controller.signal.aborted)
      );
    },
    fontUpload: {
      pending: fontUploading,
      error:
        fontError.current?.operationId === state.current.document.fontUpload?.operationId
          ? fontError.current?.message
          : undefined,
      pick: (file) => {
        void uploadSubtitleFont(file);
      },
    },
    attach,
    selectFont,
    uploadSubtitleFont,
    fontUploading,
  };
}

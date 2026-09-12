import type { DraftAttachment, PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { QueryClient } from "@tanstack/react-query";
import { type RefObject, useRef } from "react";
import type { Api } from "@/api";
import { fontsKey, uploadFont } from "@/subtitles/api";
import { uploadPlayDraftAttachment } from "./draft-api";
import type { PlaySession } from "./draft-context";
import type { DraftSessionState } from "./draft-save";

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
}): Pick<PlaySession, "attach" | "selectFont" | "uploadSubtitleFont" | "fontUploading"> {
  const fontOperation = useRef<string | null>(null);
  const attach = async (kind: DraftAttachment["kind"], files: readonly File[]): Promise<void> => {
    const refs = files.map((file) => ({ attachmentId: crypto.randomUUID(), name: file.name }));
    const current = state.current.document;
    const provided = current.form.provided;
    edit({
      ...current,
      form: {
        ...current.form,
        provided:
          kind === "images"
            ? { ...provided, images: [...provided.images, ...refs] }
            : { ...provided, [kind]: refs.at(-1) ?? null },
      },
    });
    const selected = generation();
    if (!(await flush()) || selected !== generation()) return;
    const id = state.current.id;
    if (!id) return;
    await Promise.all(
      refs.map(async (ref, index) => {
        const file = files[index];
        if (!file) return;
        const settle = (attachment: DraftAttachment) => {
          const view = state.current.view;
          if (selected !== generation() || view?.draft.id !== id) return;
          const kept = state.current.document.form.provided;
          if (
            ![kept.audio, kept.thumbnail, ...kept.images].some(
              (one) => one?.attachmentId === ref.attachmentId,
            )
          )
            return;
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
          const reply = await uploadPlayDraftAttachment(api, id, ref.attachmentId, file);
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
    const selected = generation();
    if (!(await flush()) || selected !== generation()) {
      fontOperation.current = null;
      render();
      return;
    }
    try {
      const { font } = await uploadFont(api, file);
      if (
        selected !== generation() ||
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
      if (selected === generation())
        publish({ error: error instanceof Error ? error.message : "Reattach this font" });
    } finally {
      if (fontOperation.current === operationId) {
        fontOperation.current = null;
        render();
      }
    }
  };
  return {
    attach,
    selectFont,
    uploadSubtitleFont,
    fontUploading:
      fontOperation.current !== null &&
      fontOperation.current === state.current.document.fontUpload?.operationId,
  };
}

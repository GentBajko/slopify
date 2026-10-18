import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { type ReactElement, type ReactNode, useMemo } from "react";
import { type PlaySession, PlaySessionProvider } from "@/play/draft-context";

// Play's own editors, bound to the template the studio edits instead of a Play draft: every
// change goes to the studio's unsaved document, and nothing a Play draft does (review, start,
// uploads) happens here. Files a template provides are attached to each video in Play.
const idleReview: PlaySession["review"] = {
  receipt: null,
  pending: false,
  starting: false,
  uncertain: false,
  valid: false,
  error: null,
  fields: [],
  created: null,
};

export function TemplateSession({
  document,
  onEdit,
  onFiles,
  children,
}: {
  readonly document: PlayDraftDocument;
  readonly onEdit: (document: PlayDraftDocument) => void;
  // Told when a file picker is used, so the studio can say where files are added.
  readonly onFiles: () => void;
  readonly children: ReactNode;
}): ReactElement {
  const value = useMemo(
    (): PlaySession => ({
      section: "content",
      navigate: async () => undefined,
      review: idleReview,
      reviewDraft: async () => undefined,
      startRun: async () => undefined,
      invalidateReview: () => undefined,
      takeCreated: () => null,
      activeId: null,
      fontUpload: { pending: false, error: undefined, pick: onFiles },
      fontUploading: false,
      attachmentUploading: () => false,
      selectFont: (fontId) =>
        onEdit({
          ...document,
          form: { ...document.form, subtitles: { ...document.form.subtitles, fontId } },
        }),
      uploadSubtitleFont: async () => onFiles(),
      document,
      view: null,
      status: "saved",
      error: null,
      edited: 0,
      acknowledged: 0,
      reveal: null,
      attach: async () => onFiles(),
      edit: onEdit,
      flush: async () => true,
      open: async () => false,
      generation: () => 0,
      newDraft: async () => undefined,
      discard: async () => undefined,
      saveAsNew: async () => undefined,
    }),
    [document, onEdit, onFiles],
  );
  return <PlaySessionProvider value={value}>{children}</PlaySessionProvider>;
}

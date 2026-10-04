import type { RebuildPreview, RebuildSelection } from "@app/slices/rebuild/model.js";
import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import type { UseQueryResult } from "@tanstack/react-query";
import type { RebuildConsent } from "./rebuild-review.js";
import type { EditRequest } from "./revision-action-context.js";
import type { RevisionRefusal } from "./revision-api.js";

export type EditSection =
  | "inputs"
  | "article"
  | "providers"
  | "prompts"
  | "reviews"
  | "shorts"
  | "subtitles"
  | "images"
  | "narration"
  | "captions";

// What the draft's status line says after something happened to the draft itself.
export type DraftNotice =
  | { readonly kind: "restored"; readonly savedAt: string }
  | { readonly kind: "reapplied" }
  | { readonly kind: "discarded" }
  | { readonly kind: "copied"; readonly ok: boolean };

export interface RegenerateOptions {
  // The charge the person saw and accepted at the button, in USD. A remake whose estimate is
  // no higher starts at once; anything dearer, or with no amount shown, opens the review.
  readonly approvedUpTo?: number | undefined;
}

// Everything the project's saved revisions do: the settings draft and its save, the history
// and its restore, and rebuilds (the one-press remake of outdated outputs as well as the full
// rebuild review). One hook, so the project page's next action, its settings view and its
// history all act on the same draft and the same preview.
export interface RevisionController {
  readonly saved: UseQueryResult<RevisionView>;
  readonly view: RevisionView | undefined;
  readonly edit: RevisionEdit | undefined;
  readonly preview: RebuildPreview | undefined;
  readonly focus: { readonly section: EditSection } | undefined;
  readonly pending: boolean;
  readonly uploading: boolean;
  readonly error: string | undefined;
  readonly refusal: RevisionRefusal | undefined;
  readonly unsaved: boolean;
  readonly remoteChanged: boolean;
  readonly notice: DraftNotice | undefined;
  // Something is open or on its way: a draft, a preview, a request.
  readonly busy: boolean;
  readonly setEdit: (edit: RevisionEdit) => void;
  readonly setUploading: (pending: boolean) => void;
  readonly openEditor: () => void;
  // Throws the draft away, keeping it in memory for Undo.
  readonly discard: () => void;
  readonly undoDiscard: () => void;
  readonly dismissNotice: () => void;
  readonly save: () => void;
  // After a conflict: the newest revision with this draft's own changes laid over it.
  readonly reapply: () => void;
  // The draft's changes as text on the clipboard, to keep whatever happens next.
  readonly copyEdit: () => void;
  readonly reloadCurrent: () => void;
  readonly requestEdit: (request: EditRequest) => void;
  // Makes pictures again now: saves a version with them marked and starts only them. A draft
  // with changes of its own gets the marks instead, to go with them when it is saved.
  readonly regenerateNow: (workKeys: readonly string[], options?: RegenerateOptions) => void;
  // Previews a rebuild. With `autoStart`, a preview that charges nothing starts at once
  // (`startsWithoutReview`); otherwise the review drawer opens with its scope and cost.
  readonly review: (
    selection: RebuildSelection,
    options?: { readonly autoStart?: boolean; readonly approvedUpTo?: number | undefined },
  ) => void;
  readonly start: (consent: RebuildConsent) => void;
  readonly closePreview: () => void;
  readonly restore: (targetRevisionId: string) => void;
}

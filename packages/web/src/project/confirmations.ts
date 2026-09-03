import type { StageKind } from "@app/kernel/pipeline.js";

// Every action on this page that destroys something the user cannot get back, with the
// one sentence naming the consequence. The posture is fixed: stop and confirm, the action
// verb and a dismissal, no secondary options.
//
// Retry is not here on purpose: `slices/reruns` leaves a retried stage's pieces and outputs
// where they are, so it destroys nothing and a dialog in front of the only recovery path
// would be friction.

export type Destructive =
  | { readonly kind: "cancel" }
  | { readonly kind: "rerun"; readonly stage: StageKind }
  | { readonly kind: "delete-image"; readonly outputId: string }
  | { readonly kind: "regenerate-image"; readonly outputId: string }
  | { readonly kind: "save-article"; readonly markdown: string }
  | { readonly kind: "discard-article" };

export interface Confirmation {
  readonly title: string;
  readonly consequence: string;
  readonly verb: string;
  // What the way out is called. "Cancel" beside "Cancel run" would name both halves of
  // the choice the same thing, so the cancel dialog says what keeping it does instead.
  readonly dismiss: string;
}

const rerunConsequence: Readonly<Record<StageKind, string>> = {
  research: "Replaces the notes, then re-runs every stage below.",
  article: "Replaces the article, then re-runs every stage below.",
  audio: "Replaces the narration; the video re-renders.",
  images: "Replaces every image in this run; the video re-renders.",
  thumbnail: "Replaces the thumbnail.",
  video: "Replaces the video with a fresh render.",
};

export function confirmationFor(action: Destructive): Confirmation {
  switch (action.kind) {
    case "cancel":
      return {
        title: "Cancel this run?",
        consequence: "Stops every running stage; finished outputs are kept.",
        verb: "Cancel run",
        dismiss: "Keep running",
      };
    case "rerun":
      return {
        title: "Re-run this stage?",
        consequence: rerunConsequence[action.stage],
        verb: "Re-run",
        dismiss: "Cancel",
      };
    case "delete-image":
      return {
        title: "Delete this image?",
        consequence: "Removed from the slideshow; the video re-renders.",
        verb: "Delete",
        dismiss: "Cancel",
      };
    case "regenerate-image":
      return {
        title: "Regenerate this image?",
        consequence: "Replaces the image with a new one; the video re-renders.",
        verb: "Regenerate",
        dismiss: "Cancel",
      };
    case "save-article":
      return {
        title: "Save the edited article?",
        consequence: "Replaces the article, then re-runs the narration and the video.",
        verb: "Save & re-run from audio",
        dismiss: "Cancel",
      };
    case "discard-article":
      return {
        title: "Discard these edits?",
        consequence: "The article goes back to the text on disk.",
        verb: "Discard",
        dismiss: "Keep editing",
      };
  }
}

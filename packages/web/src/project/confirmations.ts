import type { StageKind } from "@app/kernel/pipeline.js";

// Every action on this page that needs a deliberate second press, with the one sentence
// naming its consequence. The posture is fixed: stop and confirm, the action verb and a
// dismissal, no secondary options.
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
  research:
    "Generates fresh research and affected article, narration, entries, thumbnail and exports; previous outputs stay in History.",
  article:
    "Generates a fresh article and affected narration, entries, thumbnail and exports; previous outputs stay in History.",
  audio:
    "Regenerates narration and affected exports, keeping compatible cue preparation; previous outputs stay in History.",
  images:
    "Regenerates generated images and affected video, keeping supplied images and narration; previous outputs stay in History.",
  thumbnail:
    "Regenerates the thumbnail without changing the main video; previous outputs stay in History.",
  video:
    "Rebuilds local exports from saved media without regenerating narration or images; previous outputs stay in History.",
  document:
    "Renders the PDF again from the saved article and title without regenerating anything else; previous outputs stay in History.",
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
        consequence: "Removes the image and re-renders video when enabled.",
        verb: "Delete",
        dismiss: "Cancel",
      };
    case "regenerate-image":
      return {
        title: "Regenerate this image?",
        consequence: "Replaces the image with a new one and re-renders video when enabled.",
        verb: "Regenerate",
        dismiss: "Cancel",
      };
    case "save-article":
      return {
        title: "Save the edited article?",
        consequence: "Replaces the article, then updates the enabled narration and final export.",
        verb: "Save & update outputs",
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

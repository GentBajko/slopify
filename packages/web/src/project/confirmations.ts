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
  // `price`: what it is likely to cost (`stage-price.ts`), when that can be said honestly.
  | { readonly kind: "rerun"; readonly stage: StageKind; readonly price?: string | undefined }
  | { readonly kind: "delete-image"; readonly outputId: string }
  // `now`: a project with saved versions makes the picture at once and leaves the video
  // outdated, instead of rendering the video again.
  // `thumbnail`: the picture is a thumbnail, which no video shows; only the PDF's cover uses it.
  | {
      readonly kind: "regenerate-image";
      readonly outputId: string;
      readonly now?: boolean;
      readonly thumbnail?: boolean;
      readonly price?: string | undefined;
    }
  | { readonly kind: "save-article"; readonly markdown: string }
  | { readonly kind: "discard-article" };

export interface Confirmation {
  readonly title: string;
  readonly consequence: string;
  readonly verb: string;
  // What the way out is called. "Cancel" beside "Cancel run" would name both halves of
  // the choice the same thing, so the cancel dialog says what keeping it does instead. A
  // destructive dialog's way out keeps the thing ("Keep it"); "Cancel" is for neutral dialogs.
  readonly dismiss: string;
}

// What making a whole stage again does, in one sentence. The price, where it is known, comes
// first (`withPrice`), so the dialog leads with what it costs.
const rerunConsequence: Readonly<Record<StageKind, string>> = {
  research:
    "Researches the topic again, then writes again the article, narration and files that follow from it; the current ones stay under Versions.",
  article:
    "Writes the article again, then makes again the narration and files that follow from it; the current ones stay under Versions.",
  audio:
    "Records the narration again with the same voice, then makes the video again with it; the current one stays under Versions.",
  images:
    "Draws every image made from a prompt again, then makes the video again with them; pictures you supplied stay as they are.",
  thumbnail: "Draws the thumbnail again; the video and shorts are not touched.",
  video:
    "Makes the video file again from the narration and images you already have; nothing is drawn or recorded again.",
  document: "Makes the PDF again from the saved article and title; nothing else is made again.",
};

function withPrice(consequence: string, price: string | undefined): string {
  return price === undefined ? consequence : `${price} ${consequence}`;
}

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
        title: "Make this step again?",
        consequence: withPrice(rerunConsequence[action.stage], action.price),
        verb: "Make it again",
        dismiss: "Keep what is there",
      };
    case "delete-image":
      return {
        title: "Delete this image?",
        consequence: "Removes the image; the video is made again without it when the video is on.",
        verb: "Delete image",
        dismiss: "Keep it",
      };
    case "regenerate-image":
      if (action.thumbnail)
        return {
          title: "Make the thumbnail again?",
          consequence: withPrice(
            "Draws a new thumbnail from its prompt, one paid image call; the video and shorts are not touched, and the old one stays under Versions.",
            action.price,
          ),
          verb: "Make it again",
          dismiss: "Keep it",
        };
      return {
        title: "Make this image again?",
        consequence: withPrice(
          action.now
            ? "Draws a new image from its prompt, one paid image call; the video keeps the current one until the video is made again."
            : "Draws a new image from its prompt, one paid image call, and makes the video again with it when the video is on.",
          action.price,
        ),
        verb: "Make it again",
        dismiss: "Keep it",
      };
    case "save-article":
      return {
        title: "Save the edited article?",
        consequence: "Replaces the article, then updates the enabled narration and final export.",
        verb: "Save & update outputs",
        dismiss: "Keep editing",
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

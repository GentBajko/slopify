// The upload pack: everything YouTube Studio asks for when a finished video (or one of its
// shorts) is uploaded by hand, in the order Studio asks for it. Slopify never uploads or
// publishes; the pack is copied into Studio by the person, or filled in by the Slopify Studio
// extension (`packages/extension`), and the person presses Publish.
// Browser-safe: the project page and the extension read these names too.

import type { AiDisclosure } from "./disclosure.js";

// YouTube's own limits on the upload dialog's fields.
export const studioTitleMax = 100;
export const studioPlaylistMax = 150;

// The one audience a Slopify video is uploaded with. Slopify's narrated videos are not made
// for children, and Studio refuses to continue until the question is answered.
export const studioAudience = "not_made_for_kids" as const;

// Studio's upload page. It opens the upload dialog on the signed-in channel.
export const studioUploadUrl = "https://www.youtube.com/upload";

export interface PackFile {
  // `/files/<projectId>/<asset>`, served by the app to the Slopify page.
  readonly url: string;
  // The asset name inside the project, which the extension asks the app for.
  readonly asset: string;
  // What the file is called when it is saved.
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: number;
}

export interface PackItem {
  // "video" is the long video; a short carries its 1-based number.
  readonly kind: "video" | "short";
  readonly short?: number | undefined;
  readonly video: PackFile | null;
  readonly title: string;
  // The whole description as it goes into Studio, chapters and hashtags included.
  readonly description: string;
  readonly tags: readonly string[];
  // Up to three; Studio's Test & Compare takes all three, its thumbnail field the first.
  readonly thumbnails: readonly PackFile[];
  readonly audience: typeof studioAudience;
  // Studio's "AI use" answer (it was "Altered or synthetic content") and why (`disclosure.ts`).
  readonly alteredContent: AiDisclosure;
  readonly playlist: string | null;
  // What was changed in the description's chapters to meet YouTube's rules
  // (`slices/youtube/chapters.ts`); absent when nothing was.
  readonly chapterNotice?: string | undefined;
}

export interface UploadPack {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly items: readonly PackItem[];
  // What the pack is still missing, as plain sentences with the fix; empty when complete.
  readonly missing: readonly string[];
  // The video's uploaded clips and whether they are marked as real footage (the AI use step's
  // tick). Absent when the project has none.
  readonly footage?: { readonly clips: number; readonly real: boolean } | undefined;
}

// The pack as the extension asks for it: which item the person chose in Slopify.
export interface ActivePack {
  readonly pack: UploadPack;
  readonly item: PackItem;
}

// The steps in Studio's order, as the Prepare upload view lists them.
export const studioSteps = [
  "video",
  "title",
  "description",
  "thumbnails",
  "playlist",
  "audience",
  "altered",
  "tags",
] as const;
export type StudioStep = (typeof studioSteps)[number];

// Tags as Studio's field takes them: comma-separated.
export function tagsLine(tags: readonly string[]): string {
  return tags.join(", ");
}

// What the pairing looks like to Settings: the token to paste into the extension, and the
// extension that used it, once one has.
export interface StudioPairingView {
  readonly token: string;
  readonly origin: string | null;
  readonly pairedAt: string | null;
}

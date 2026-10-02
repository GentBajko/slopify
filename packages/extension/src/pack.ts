// The upload pack as the Slopify app sends it (`packages/app/src/slices/studio/model.ts`).
// Kept here as a copy rather than imported, so the extension builds on its own; a field added
// there is added here too.

export interface PackFile {
  readonly url: string;
  readonly asset: string;
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: number;
}

export interface PackItem {
  readonly kind: "video" | "short";
  readonly short?: number | undefined;
  readonly video: PackFile | null;
  readonly title: string;
  // Other titles for Studio's A/B Testing, beside `title`. Absent from a Slopify older than
  // title tests.
  readonly titles?: readonly string[] | undefined;
  readonly description: string;
  readonly tags: readonly string[];
  readonly thumbnails: readonly PackFile[];
  readonly audience: "not_made_for_kids";
  // Studio's "Altered or synthetic content" answer and why. Absent from a Slopify older than
  // the answer, and then the question is left to the person.
  readonly alteredContent?: { readonly altered: boolean; readonly why: string } | undefined;
  // Every playlist the upload goes into. Absent from a Slopify older than several playlists,
  // which sends `playlist` alone.
  readonly playlists?: readonly string[] | undefined;
  readonly playlist: string | null;
  readonly chapterNotice?: string | undefined;
  // From 3.3.0: when it goes out (ISO, typed into Studio's schedule), the long video's captions,
  // its end screen's video, a short's related video, and the comment to pin.
  readonly scheduleAt?: string | undefined;
  readonly captions?: PackFile | undefined;
  readonly endScreenVideoId?: string | undefined;
  readonly relatedVideoId?: string | undefined;
  readonly pinnedComment?: string | undefined;
}

// The playlists to tick, from either kind of Slopify.
export function playlistsOf(item: PackItem): readonly string[] {
  return item.playlists ?? (item.playlist === null ? [] : [item.playlist]);
}

export interface ActivePack {
  readonly pack: { readonly projectId: string; readonly projectTitle: string };
  readonly item: PackItem;
  // How many items wait to be filled, this one included. Absent from an older Slopify.
  readonly waiting?: number | undefined;
}

// What the background worker hands the Studio page: the item, and its thumbnails' bytes, so
// the page never talks to Slopify itself.
export interface FillPayload {
  readonly projectId: string;
  readonly waiting?: number | undefined;
  readonly item: PackItem;
  // The captions file's bytes, for the Details-page touches.
  readonly captions?: { readonly filename: string; readonly base64: string } | undefined;
  readonly thumbnails: readonly {
    readonly filename: string;
    readonly contentType: string;
    // Base64, because messages between the worker and the page are JSON.
    readonly base64: string;
  }[];
}

// Messages the extension's pages send its background worker.
export type WorkerRequest =
  | { readonly type: "pair"; readonly base: string; readonly token: string }
  | { readonly type: "status" }
  | { readonly type: "payload" }
  // The next waiting item without its thumbnails' bytes: what the file picker step needs.
  | { readonly type: "pack" }
  // The page filled this item: Slopify takes it out of the queue, so the next upload dialog
  // gets the next one.
  | { readonly type: "filled"; readonly projectId: string; readonly short: number | null }
  // The upload became this YouTube video: Slopify keeps its id, and an A/B test waits for it.
  | {
      readonly type: "video";
      readonly projectId: string;
      readonly short: number | null;
      readonly videoId: string;
    }
  // Rows of Studio's Content list, matched to projects by title.
  | {
      readonly type: "backfill";
      readonly videos: readonly {
        readonly title: string;
        readonly videoId: string;
        readonly checks?: string;
      }[];
      // Opened by the worker only to read the checks: close the tab once sent.
      readonly close?: boolean;
    }
  // The toolbar popup: the projects ready to upload, and the one clicked.
  | { readonly type: "ready" }
  // The popup's "Read Studio numbers now": the daily sweep, at once.
  | { readonly type: "stats-now" }
  | { readonly type: "upload"; readonly projectId: string; readonly short: number | null }
  // Studio said the upload was scheduled or published.
  | {
      readonly type: "video-done";
      readonly projectId: string;
      readonly short: number | null;
      readonly videoId: string;
    }
  // A Studio page opened for one upload (A/B test, Details touches) asks for its item.
  | { readonly type: "item"; readonly projectId: string; readonly short: number | null }
  // The popup's Upload all Shorts.
  | { readonly type: "upload-all"; readonly projectId: string }
  // A Details-page touch or a pinned comment, done or not; the worker closes its tab.
  | {
      readonly type: "task-result";
      readonly task: "finish" | "comment";
      readonly projectId: string;
      readonly short: number | null;
      readonly ok: boolean;
      readonly message: string;
    }
  // A video's numbers read from its Analytics; `last` closes the tab and opens the next.
  | {
      readonly type: "stats";
      readonly projectId: string;
      readonly short: number | null;
      readonly videoId: string;
      readonly metrics: Readonly<Record<string, number>>;
      readonly abVariants?: readonly {
        readonly title: string | null;
        readonly thumbnail: number | null;
        readonly share: number | null;
        readonly winner: boolean;
      }[];
      readonly last: boolean;
    };

// A finished project not marked uploaded, as the popup lists it.
export interface ReadyProject {
  readonly projectId: string;
  readonly title: string;
  readonly items: readonly {
    readonly kind: "video" | "short";
    readonly short: number | null;
    readonly title: string;
    // Rendered, so there is a file to upload.
    readonly ready: boolean;
    // On YouTube: Studio said it was scheduled or published, or a link was pasted.
    readonly uploaded: boolean;
    // Filled in Studio but not confirmed: cancelled, or left as a draft. Absent from an older
    // Slopify.
    readonly started?: boolean;
    // When it goes out (ISO), from the posting plan; and its YouTube video once known.
    readonly scheduleAt?: string;
    readonly uploadBy?: string;
    readonly videoId?: string;
  }[];
}

// An upload with something waiting on YouTube's side, as Slopify lists it.
export interface WaitingTask {
  readonly projectId: string;
  readonly short: number | null;
  readonly videoId: string;
  readonly item: PackItem;
}

// The whole item as text, for pasting by hand when the dialog can't be filled.
export function packText(item: PackItem): string {
  const parts = [
    `Title:\n${item.title}`,
    ...((item.titles ?? []).length > 0
      ? [`Other titles (A/B Testing):\n${(item.titles ?? []).join("\n")}`]
      : []),
    `Description:\n${item.description}`,
    `Tags:\n${item.tags.join(", ")}`,
    `Playlists: ${playlistsOf(item).join(", ") || "(none)"}`,
    "Audience: No, it's not made for kids",
  ];
  if (item.alteredContent !== undefined)
    parts.push(
      `AI use (under Show more): ${item.alteredContent.altered ? "Yes" : "No"}. ${item.alteredContent.why}`,
    );
  return `${parts.join("\n\n")}\n`;
}

export type WorkerAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

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
  // The page filled this item: Slopify takes it out of the queue, so the next upload dialog
  // gets the next one.
  | { readonly type: "filled"; readonly projectId: string; readonly short: number | null };

// The whole item as text, for pasting by hand when the dialog can't be filled.
export function packText(item: PackItem): string {
  const parts = [
    `Title:\n${item.title}`,
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

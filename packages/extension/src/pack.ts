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
  readonly playlist: string | null;
}

export interface ActivePack {
  readonly pack: { readonly projectId: string; readonly projectTitle: string };
  readonly item: PackItem;
}

// What the background worker hands the Studio page: the item, and its thumbnails' bytes, so
// the page never talks to Slopify itself.
export interface FillPayload {
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
  | { readonly type: "payload" };

export type WorkerAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

// Unsaved edits kept in this browser, so leaving a page, a reload or an app update does not
// lose them. An editor writes its draft here while it differs from what is saved and clears
// it once saved or deliberately thrown away; on its next visit it finds the draft and offers
// it back. Storage can be full or blocked (a private window): every access is guarded and a
// draft that cannot be kept is simply not kept, never an error in the editor.

const prefix = "slopify.draft.";

export interface StoredDraft<T> {
  readonly value: T;
  // What the draft was edited from, such as the saved revision's id.
  readonly base: string;
  readonly savedAt: string;
}

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readDraft<T>(
  key: string,
  accept: (value: unknown) => value is T,
): StoredDraft<T> | undefined {
  const raw = (() => {
    try {
      return storage()?.getItem(prefix + key) ?? null;
    } catch {
      return null;
    }
  })();
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const value: unknown = "value" in parsed ? parsed.value : undefined;
    const base: unknown = "base" in parsed ? parsed.base : undefined;
    const savedAt: unknown = "savedAt" in parsed ? parsed.savedAt : undefined;
    if (typeof base !== "string" || typeof savedAt !== "string" || !accept(value)) return undefined;
    return { value, base, savedAt };
  } catch {
    return undefined;
  }
}

// False when the browser would not keep it (storage full or blocked).
export function writeDraft(key: string, value: unknown, base: string, now = new Date()): boolean {
  try {
    const store = storage();
    if (store === undefined) return false;
    store.setItem(prefix + key, JSON.stringify({ value, base, savedAt: now.toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  try {
    storage()?.removeItem(prefix + key);
  } catch {
    // Nothing to clear in a browser that keeps nothing.
  }
}

export function storedDraftCount(): number {
  try {
    const store = storage();
    if (store === undefined) return 0;
    let count = 0;
    for (let at = 0; at < store.length; at += 1)
      if (store.key(at)?.startsWith(prefix) === true) count += 1;
    return count;
  } catch {
    return 0;
  }
}

// Editors that write their draft after a pause register here, so a forced reload (the update
// prompt) can write every pending draft first.
const flushers = new Set<() => void>();

export function registerDraftFlush(flush: () => void): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

// Writes every pending draft now. Returns how many drafts this browser holds afterwards.
export function flushDrafts(): number {
  for (const flush of flushers) {
    try {
      flush();
    } catch {
      // One editor failing to write must not stop the others.
    }
  }
  return storedDraftCount();
}

// The update prompt's reload: every pending draft is written first, and the leave warnings
// stand aside, since nothing unsaved is lost by it.
let reloading = false;

export function prepareReload(): number {
  reloading = true;
  return flushDrafts();
}

export function reloadPrepared(): boolean {
  return reloading;
}

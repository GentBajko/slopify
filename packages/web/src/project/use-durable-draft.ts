import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { useEffect, useRef } from "react";
import {
  clearDraft,
  readDraft,
  registerDraftFlush,
  type StoredDraft,
  writeDraft,
} from "@/lib/draft-store";
import { isRevisionEdit } from "./draft-merge.js";

const writeDelayMs = 400;

export function revisionDraftKey(projectId: string): string {
  return `project-revision:${projectId}`;
}

// Keeps the project's unsaved settings draft in this browser while it differs from the
// revision it was edited from: written a moment after each change, and at once when the page
// is hidden, the editor goes away or the update prompt reloads the tab.
export function useDurableDraft(
  projectId: string,
  view: RevisionView | undefined,
  edit: RevisionEdit | undefined,
  unsaved: boolean,
): {
  // A stored draft not yet offered back on this visit.
  readonly waiting: () => boolean;
  // The stored draft, once per visit.
  readonly take: () => StoredDraft<RevisionEdit> | undefined;
  readonly clear: () => void;
} {
  const key = revisionDraftKey(projectId);
  const checked = useRef<string | undefined>(undefined);
  const pendingWrite = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (edit === undefined || view === undefined) return;
    if (!unsaved) {
      pendingWrite.current = undefined;
      clearDraft(key);
      return;
    }
    const base = view.revision.id;
    const write = () => {
      pendingWrite.current = undefined;
      writeDraft(key, edit, base);
    };
    pendingWrite.current = write;
    const timer = setTimeout(write, writeDelayMs);
    return () => clearTimeout(timer);
  }, [key, edit, view, unsaved]);

  useEffect(() => {
    const flush = () => pendingWrite.current?.();
    const unregister = registerDraftFlush(flush);
    window.addEventListener("pagehide", flush);
    return () => {
      unregister();
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  return {
    waiting: () => {
      if (checked.current === key) return false;
      if (readDraft(key, isRevisionEdit) !== undefined) return true;
      checked.current = key;
      return false;
    },
    take: () => {
      if (checked.current === key) return undefined;
      checked.current = key;
      return readDraft(key, isRevisionEdit);
    },
    clear: () => {
      pendingWrite.current = undefined;
      clearDraft(key);
    },
  };
}

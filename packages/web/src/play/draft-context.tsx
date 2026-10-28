import type {
  DraftView,
  PlayDraftDocument,
  PlayStartResult,
} from "@app/slices/play-drafts/model.js";
import { createContext, type ReactElement, type ReactNode, useContext } from "react";
import type { ControlledFontUpload } from "@/subtitles/font-picker";
import type { PlaySection } from "./sections";
import type { UploadSlot } from "./state";
import { useDraftSession } from "./use-draft-session";

export type DraftSaveStatus = "unsaved" | "saving" | "saved" | "error" | "conflict";
export type { PlaySection } from "./sections";
export interface PlayNavigation {
  readonly section: PlaySection;
  // `reveal: false` only moves to the section (closing the summary), opening nothing.
  readonly navigate: (
    section: PlaySection,
    field?: string,
    options?: { readonly reveal?: boolean },
  ) => Promise<void>;
}
export interface RevealRequest {
  readonly section: PlaySection;
  readonly field?: string;
  readonly sequence: number;
}
export interface PlaySession extends PlayNavigation {
  readonly review: import("./review-state").ReviewState;
  readonly reviewDraft: (options?: { readonly quiet?: boolean }) => Promise<void>;
  readonly startRun: () => Promise<void>;
  readonly invalidateReview: (clearFields?: boolean) => void;
  readonly takeCreated: () => PlayStartResult | null;
  readonly activeId: string | null;
  readonly fontUpload: ControlledFontUpload;
  readonly fontUploading: boolean;
  readonly attachmentUploading: (attachmentId: string) => boolean;
  readonly selectFont: (fontId: string) => void;
  readonly uploadSubtitleFont: (file: File) => Promise<void>;
  readonly document: PlayDraftDocument;
  readonly view: DraftView | null;
  readonly status: DraftSaveStatus;
  readonly error: string | null;
  readonly edited: number;
  readonly acknowledged: number;
  readonly reveal: RevealRequest | null;
  // The draft Create reopened by itself on arrival, while it is the open one.
  readonly restored?: { readonly id: string; readonly updatedAt: string } | undefined;
  readonly attach: (slot: UploadSlot, files: readonly File[], replaceId?: string) => Promise<void>;
  readonly edit: (document: PlayDraftDocument) => void;
  // The draft as it is now, with edits and fills not drawn yet: what a change made from the
  // last drawing of the page applies to, so it never undoes them.
  readonly latest?: () => PlayDraftDocument;
  readonly flush: () => Promise<boolean>;
  readonly open: (
    id: string,
    isCurrent?: () => boolean,
    // Takes what was typed in the draft being left into the opened one (the topic).
    carry?: (typed: PlayDraftDocument, opened: PlayDraftDocument) => PlayDraftDocument,
  ) => Promise<boolean>;
  readonly generation: () => number;
  readonly newDraft: () => Promise<void>;
  // Picks the services the first launch found (else the ready ones) wherever none is picked,
  // on the fresh form and on a draft just made from a template.
  readonly adoptDefaults?: (defaults: import("./draft-state").FreshProviderDefaults) => void;
  // Holds the fresh form's first save while the starter template is on its way.
  readonly holdFresh?: (hold: boolean) => void;
  // Makes the sidebar's channel a fresh, untouched draft's channel.
  readonly adoptChannel?: (channelId: string) => void;
  readonly discard: (target: { readonly id: string; readonly version: number }) => Promise<void>;
  readonly saveAsNew: () => Promise<void>;
}
const DraftContext = createContext<PlaySession | null>(null);
export function PlayDraftProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const session = useDraftSession();
  return <DraftContext.Provider value={session}>{children}</DraftContext.Provider>;
}
// Play's editors over another document than a Play draft: the template studio's Fine-tune
// binds them to the template it edits (`template-studio/session.tsx`).
export function PlaySessionProvider({
  value,
  children,
}: {
  readonly value: PlaySession;
  readonly children: ReactNode;
}): ReactElement {
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
// The same, or null outside the shell (a page rendered on its own in a test).
export function useOptionalPlaySession(): PlaySession | null {
  return useContext(DraftContext);
}
export function usePlaySession(): PlaySession {
  const context = useContext(DraftContext);
  if (!context) throw new Error("PlayDraftProvider is required");
  return context;
}

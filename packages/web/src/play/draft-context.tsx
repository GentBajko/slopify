import type {
  DraftAttachment,
  DraftView,
  PlayDraftDocument,
} from "@app/slices/play-drafts/model.js";
import { createContext, type ReactElement, type ReactNode, useContext } from "react";
import { useDraftSession } from "./use-draft-session";

export type DraftSaveStatus = "unsaved" | "saving" | "saved" | "error" | "conflict";
export type PlaySection = "content" | "outputs" | "style" | "review";
export interface PlayNavigation {
  readonly section: PlaySection;
  readonly navigate: (section: PlaySection, field?: string) => Promise<void>;
}
export interface RevealRequest {
  readonly section: PlaySection;
  readonly field?: string;
  readonly sequence: number;
}
export interface PlaySession extends PlayNavigation {
  readonly activeId: string | null;
  readonly fontUploading: boolean;
  readonly selectFont: (fontId: string) => void;
  readonly uploadSubtitleFont: (file: File) => Promise<void>;
  readonly document: PlayDraftDocument;
  readonly view: DraftView | null;
  readonly status: DraftSaveStatus;
  readonly error: string | null;
  readonly edited: number;
  readonly acknowledged: number;
  readonly reveal: RevealRequest | null;
  readonly attach: (kind: DraftAttachment["kind"], files: readonly File[]) => Promise<void>;
  readonly edit: (document: PlayDraftDocument) => void;
  readonly flush: () => Promise<boolean>;
  readonly open: (id: string) => Promise<void>;
  readonly newDraft: () => Promise<void>;
  readonly discard: () => Promise<void>;
  readonly saveAsNew: () => Promise<void>;
}
const DraftContext = createContext<PlaySession | null>(null);
export function PlayDraftProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const session = useDraftSession();
  return <DraftContext.Provider value={session}>{children}</DraftContext.Provider>;
}
export function usePlaySession(): PlaySession {
  const context = useContext(DraftContext);
  if (!context) throw new Error("PlayDraftProvider is required");
  return context;
}

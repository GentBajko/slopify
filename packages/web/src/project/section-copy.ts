import { createContext } from "react";

// The YouTube text's copy actions, for a section other than YouTube text to offer: the Video
// section's Copy description and Copy tags copy exactly what the YouTube text section would
// (placeholders filled, chapters fitted). The YouTube block fills it on each render; the page
// holds it, so a button elsewhere reads the latest text when pressed.
export interface YoutubeCopy {
  description?: (() => void) | undefined;
  tags?: (() => void) | undefined;
}

export const YoutubeCopyContext = createContext<{ current: YoutubeCopy } | undefined>(undefined);

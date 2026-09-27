import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { RunConfig } from "../admission/model.js";
import { sniffImage } from "../channels/images.js";
import { imageBlob } from "../channels/repo.js";
import type { PortraitOverlay } from "../video/ffmpeg.js";
import { usesVoices, type VoicesSettings } from "./model.js";
import { panelTiles, usesSpeakerPanel } from "./panel.js";

// The speaker panel's portraits, one entry per speaker in list order: the picture's bytes, or
// undefined for an initials tile. A speaker without a portrait, or whose picture is not in this
// Slopify's database as a PNG or JPEG (a backup from another install carries only a stand-in),
// keeps the initials. The caption file and the render both ask this, so the tile left empty
// in one is the tile the other fills.
export interface Portrait {
  readonly sha256: string;
  readonly bytes: Uint8Array;
  readonly extension: ".png" | ".jpg";
}

export function panelPortraits(
  db: DatabaseSync,
  voices: VoicesSettings | undefined,
): readonly (Portrait | undefined)[] {
  if (voices === undefined || !usesSpeakerPanel(voices.format)) return [];
  return voices.speakers.map((speaker) => {
    if (speaker.portrait === undefined) return undefined;
    const blob = imageBlob(db, speaker.portrait);
    const mime = blob === undefined ? undefined : sniffImage(blob.bytes);
    return blob === undefined || mime === undefined
      ? undefined
      : {
          sha256: speaker.portrait,
          bytes: blob.bytes,
          extension: mime === "image/png" ? ".png" : ".jpg",
        };
  });
}

// What the portraits add to the caption file's fingerprint: nothing unless a panel speaker has
// one, so captions made before portraits (or without any) keep the fingerprint they had.
export function portraitValues(voices: VoicesSettings): readonly (string | null)[] | undefined {
  if (!usesSpeakerPanel(voices.format)) return undefined;
  const values = voices.speakers.map((speaker) => speaker.portrait ?? null);
  return values.some((value) => value !== null) ? values : undefined;
}

// The portraits written beside the caption file the join reads, at the tiles the caption file
// left empty for them. Undefined when no speaker has one, so every other video renders with the
// arguments it always had.
export function writePortraits(
  db: DatabaseSync,
  config: RunConfig,
  directory: string,
):
  | {
      readonly overlays: readonly PortraitOverlay[];
      readonly recorded: readonly { readonly speaker: string; readonly sha256: string }[];
    }
  | undefined {
  const voices = usesVoices(config) ? config.voices : undefined;
  const portraits = panelPortraits(db, voices);
  if (voices === undefined || portraits.every((one) => one === undefined)) return undefined;
  // The caption file's frame (`rebuild/runtime-subtitles.ts`), so a portrait lands in its tile.
  const tiles = panelTiles(
    voices.speakers.length,
    config.format === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 },
  );
  const overlays: PortraitOverlay[] = [];
  const recorded: { speaker: string; sha256: string }[] = [];
  portraits.forEach((portrait, index) => {
    const tile = tiles[index];
    const speaker = voices.speakers[index];
    if (portrait === undefined || tile === undefined || speaker === undefined) return;
    const path = `portrait-${String(index)}${portrait.extension}`;
    writeFileSync(join(directory, path), portrait.bytes, { mode: 0o600 });
    overlays.push({ path, x: tile.x, y: tile.y, size: tile.size });
    recorded.push({ speaker: speaker.id, sha256: portrait.sha256 });
  });
  return { overlays, recorded };
}

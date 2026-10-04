// A project moved to another channel in Edit project, or its brand kit switched on or off:
// the run takes the new channel's cast as it is now and its brand kit again, as Play does when
// a run starts (`runs.ts`). The kit fills what is at its default; a value the old channel's kit
// had put there is replaced by the new kit's, and one the person set themselves is kept.
// Nothing changes while the channel and the switch stay as they were, so saving any other
// edit leaves the project's cast and brand exactly as they were.

import type { DatabaseSync } from "node:sqlite";
import type { RunConfig } from "../admission/model.js";
import { type DocumentSettings, defaultDocumentTheme } from "../document/model.js";
import { entryByName } from "../library/repo.js";
import type { RevisionEdit } from "../revisions/model.js";
import type { BrandKit } from "./model.js";
import { channelById, resolveChannelId } from "./repo.js";
import { brandDocument, castSnapshot } from "./runs.js";

export function channelChanged(db: DatabaseSync, before: RunConfig, after: RunConfig): boolean {
  return resolveChannelId(db, before.channelId) !== resolveChannelId(db, after.channelId);
}

export function rebrandedEdit(db: DatabaseSync, base: RunConfig, edit: RevisionEdit): RevisionEdit {
  const oldId = resolveChannelId(db, base.channelId);
  const newId = resolveChannelId(db, edit.config.channelId);
  const oldKit = base.useBrandKit !== false;
  const newKit = edit.config.useBrandKit !== false;
  if (oldId === newId && oldKit === newKit) return edit;
  const oldBrand: BrandKit = oldKit ? (channelById(db, oldId)?.brand ?? {}) : {};
  const newBrand: BrandKit = newKit ? (channelById(db, newId)?.brand ?? {}) : {};
  const { useBrandKit: _kit, cast: _cast, ...rest } = edit.config;
  let config: RunConfig = {
    ...rest,
    channelId: newId,
    ...(newKit ? {} : { useBrandKit: false as const }),
  };
  // The cast goes with the channel; the brand kit switch never changes it.
  const cast = oldId === newId ? edit.config.cast : castSnapshot(db, newId);
  if (cast !== undefined && cast.length > 0) config = { ...config, cast };
  let content = edit.content;

  if (config.subtitles !== undefined) {
    const subtitles = { ...config.subtitles };
    const font = swapped(
      subtitles.fontId,
      oldBrand.captionFontId,
      newBrand.captionFontId,
      "default",
    );
    subtitles.fontId = font ?? "default";
    assign(
      subtitles,
      "color",
      swapped(subtitles.color, oldBrand.captionColor, newBrand.captionColor),
    );
    assign(
      subtitles,
      "outlineColor",
      swapped(subtitles.outlineColor, oldBrand.captionOutlineColor, newBrand.captionOutlineColor),
    );
    config = { ...config, subtitles };
  }

  const titleStyle: { fontId?: string; color?: string } = {};
  assign(
    titleStyle,
    "fontId",
    swapped(config.titleStyle?.fontId, oldBrand.titleFontId, newBrand.titleFontId),
  );
  assign(
    titleStyle,
    "color",
    swapped(config.titleStyle?.color, oldBrand.titleColor, newBrand.titleColor),
  );
  const { titleStyle: _title, endScreen: _end, ...unstyled } = config;
  const endScreen = swapped(config.endScreen?.text, oldBrand.endScreenText, newBrand.endScreenText);
  config = {
    ...unstyled,
    ...(Object.keys(titleStyle).length === 0 ? {} : { titleStyle }),
    ...(endScreen === undefined ? {} : { endScreen: { text: endScreen } }),
  };

  // An intro or outro is read only while narration is generated.
  if (config.sources.audio === "generate")
    for (const category of ["intro", "outro"] as const) {
      const current = config[category]?.name;
      const old = oldBrand[category];
      const fromOldKit =
        current === undefined || (old !== undefined && current.toLowerCase() === old.toLowerCase());
      if (!fromOldKit) continue;
      const name = newBrand[category];
      const entry = name === undefined ? undefined : entryByName(db, category, name);
      if (entry === undefined) {
        if (current === undefined) continue;
        const { [category]: _dropped, ...without } = config;
        config = without;
        continue;
      }
      config = { ...config, [category]: { name: entry.name, mode: entry.mode } };
      content = {
        ...content,
        promptTemplates: { ...content.promptTemplates, [category]: entry.body },
      };
    }

  // The PDF's theme, while the project makes one.
  if (config.document !== undefined) {
    const identity = config.document.custom?.id ?? config.document.theme;
    const fromOldKit =
      identity === (oldBrand.documentTheme ?? defaultDocumentTheme) ||
      (config.document.custom === undefined && config.document.theme === defaultDocumentTheme);
    if (fromOldKit) {
      const document: DocumentSettings = brandDocument(db, newBrand) ?? {
        theme: defaultDocumentTheme,
      };
      config = { ...config, document };
    }
  }
  return { ...edit, config, content };
}

// The value a brand-kit setting takes: the new kit's when the current one is unset, the
// fallback, or what the old kit put there; otherwise the person's own, kept.
function swapped(
  current: string | undefined,
  old: string | undefined,
  next: string | undefined,
  fallback?: string,
): string | undefined {
  const fromOldKit =
    current === undefined || current === fallback || (old !== undefined && same(current, old));
  return fromOldKit ? (next ?? fallback) : current;
}

// Channels store colours as #RRGGBB, a project's own colour boxes may hold #rrggbb: the same colour.
function same(one: string, other: string): boolean {
  return one.startsWith("#") && other.startsWith("#")
    ? one.toLowerCase() === other.toLowerCase()
    : one === other;
}

function assign<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined) {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

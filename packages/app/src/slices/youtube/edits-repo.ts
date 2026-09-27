// Where the hand edits and the channel links are kept: the edits per project in
// `youtube_description_edits`, each channel's links in its brand kit, and the older Settings list
// of links (read as the default channel's until its Brand tab saves its own) as one `settings` row.

import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { defaultChannelId } from "../channels/model.js";
import { channelById, projectChannelId } from "../channels/repo.js";
import { readSetting, writeSetting } from "../settings/repo.js";
import { chapterNotice, fitChapters } from "./chapters.js";
import type { DescriptionEdits } from "./edits.js";
import {
  composeDescription,
  descriptionFields,
  resolveFields,
  shownFields,
  splitDescription,
} from "./edits.js";
import type { ChannelLink } from "./placeholders.js";
import { fillPlaceholders, mergeLinks } from "./placeholders.js";

export const channelLinksKey = "channel_links";

const fieldEdit = z.object({ base: z.string(), text: z.string() }).strict();
const editsSchema = z
  .object(Object.fromEntries(descriptionFields.map((field) => [field, fieldEdit.optional()])))
  .strict();
const linksSchema = z.array(z.object({ name: z.string(), url: z.string() }).strict());

export interface ProjectDescriptionEdits {
  readonly fields: DescriptionEdits;
  // This project's own links, such as its "Previous video".
  readonly links: readonly ChannelLink[];
}

const none: ProjectDescriptionEdits = { fields: {}, links: [] };

export function readDescriptionEdits(db: DatabaseSync, projectId: string): ProjectDescriptionEdits {
  const row = db
    .prepare("SELECT fields_json,links_json FROM youtube_description_edits WHERE project_id=?")
    .get(projectId);
  if (row === undefined) return none;
  const parsed = z.object({ fields_json: z.string(), links_json: z.string() }).parse(row);
  return {
    fields: editsSchema.parse(JSON.parse(parsed.fields_json)) as DescriptionEdits,
    links: linksSchema.parse(JSON.parse(parsed.links_json)),
  };
}

export function writeDescriptionEdits(
  db: DatabaseSync,
  projectId: string,
  edits: ProjectDescriptionEdits,
  updatedAt: string,
): void {
  if (Object.keys(edits.fields).length === 0 && edits.links.length === 0) {
    db.prepare("DELETE FROM youtube_description_edits WHERE project_id=?").run(projectId);
    return;
  }
  db.prepare(
    `INSERT INTO youtube_description_edits (project_id,fields_json,links_json,updated_at) VALUES (?,?,?,?)
     ON CONFLICT(project_id) DO UPDATE SET fields_json=excluded.fields_json,links_json=excluded.links_json,updated_at=excluded.updated_at`,
  ).run(projectId, JSON.stringify(edits.fields), JSON.stringify(edits.links), updatedAt);
}

export function readChannelLinks(db: DatabaseSync): readonly ChannelLink[] {
  const value = readSetting(db, channelLinksKey);
  if (value === undefined) return [];
  // A hand-edited row that no longer parses reads as no links rather than breaking the page;
  // saving the list in Settings writes a good one again.
  try {
    const parsed = linksSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function writeChannelLinks(db: DatabaseSync, links: readonly ChannelLink[]): void {
  writeSetting(
    db,
    channelLinksKey,
    JSON.stringify(links.map((link) => ({ name: link.name.trim(), url: link.url.trim() }))),
  );
}

// A channel's links: the ones its Brand tab saved. The default channel, until its Brand tab
// saves a list of its own (even an empty one), reads the older Settings list, so links saved
// before channels had their own keep filling. A channel that is gone has none.
export function readChannelLinksFor(db: DatabaseSync, channelId: string): readonly ChannelLink[] {
  const channel = channelById(db, channelId);
  if (channel === undefined) return [];
  if (channel.brand.links !== undefined) return channel.brand.links;
  return channel.id === defaultChannelId ? readChannelLinks(db) : [];
}

// The description and tags as the project page shows and copies them: the user's edits over
// the generated text, the chapters fitted to YouTube's rules (`chapters.ts`; the last one's
// length only checked when the video's length is given), placeholders filled from the
// project's and its channel's links (one with no link stays as typed). For anything that hands
// the description on, such as Prepare upload and the downloads. `chapterNotice` says what the
// fitting changed.
export function effectiveDescription(
  db: DatabaseSync,
  projectId: string,
  generated: {
    readonly description: string;
    readonly tags: string;
    readonly durationSeconds?: number | undefined;
  },
): { readonly description: string; readonly tags: string; readonly chapterNotice?: string } {
  const edits = readDescriptionEdits(db, projectId);
  const shown = shownFields(
    resolveFields(splitDescription(generated.description, generated.tags), edits.fields),
  );
  const fitted = fitChapters(shown.chapters, generated.durationSeconds);
  const notice = chapterNotice(fitted.adjustments);
  const links = mergeLinks(readChannelLinksFor(db, projectChannelId(db, projectId)), edits.links);
  return {
    description: fillPlaceholders(composeDescription({ ...shown, chapters: fitted.text }), links)
      .text,
    tags: fillPlaceholders(shown.tags, links).text,
    ...(notice === undefined ? {} : { chapterNotice: notice }),
  };
}

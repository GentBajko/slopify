import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import { readSetting, writeSetting } from "../settings/repo.js";
import { channelById } from "./repo.js";
import { titlesFromCsv, titlesFromLines } from "./studio-csv.js";

// Channel page → Existing videos: the titles of videos the channel made before (or outside)
// Slopify, pasted or imported from a YouTube Studio CSV, so topic suggestions and duplicate
// checks skip them too (`slices/schedules/topics.ts`). A CSV is previewed first so videos of
// other channels in the same Studio export can be unticked; the ticked titles are then saved
// as lines, and the preview's "Keep only titles containing…" text is remembered per channel.

export interface ChannelVideo {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

export interface ChannelVideoDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly uuid: () => string;
}

export type VideoResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: "not-found" | "invalid-input";
      readonly message?: string | undefined;
    };

export const videoTitleMax = 500;
// ceiling: a channel with more uploads than this imports the first ones; the topic prompt
// only lists 5,000 titles anyway.
export const importMax = 10_000;
export const importFilterMax = 200;
const filterKey = (channelId: string): string => `channels.importFilter.${channelId}`;

const importSchema = z
  .object({
    // "lines": one title per line; "csv": a CSV export, the title column found by its header.
    format: z.enum(["lines", "csv"]),
    text: z.string().max(20_000_000, "This file is too large. Import at most 20 MB at a time."),
    // The preview's "Keep only titles containing…" text, remembered for the next import.
    filter: z
      .string()
      .max(
        importFilterMax,
        `The filter is too long to remember. Shorten "Keep only titles containing…" on the channel's Existing videos tab to at most ${importFilterMax} characters.`,
      )
      .optional(),
  })
  .strict();

const row = z.object({ id: z.string(), title: z.string(), created_at: z.string() });

export function channelVideos(db: DatabaseSync, channelId: string): readonly ChannelVideo[] {
  return db
    .prepare(
      "SELECT id,title,created_at FROM channel_videos WHERE channel_id=? ORDER BY lower(title), id",
    )
    .all(channelId)
    .map((value) => {
      const parsed = row.parse(value);
      return { id: parsed.id, title: parsed.title, createdAt: parsed.created_at };
    });
}

export function channelVideoTitles(db: DatabaseSync, channelId: string): readonly string[] {
  return channelVideos(db, channelId).map((video) => video.title);
}

export function listChannelVideos(
  deps: Pick<ChannelVideoDeps, "db">,
  channelId: string,
): VideoResult<readonly ChannelVideo[]> {
  if (channelById(deps.db, channelId) === undefined) return { ok: false, reason: "not-found" };
  return { ok: true, value: channelVideos(deps.db, channelId) };
}

// The titles an import would add and the channel's last "Keep only titles containing…" text
// ("" when none); nothing is saved.
export function previewChannelVideos(
  deps: Pick<ChannelVideoDeps, "db">,
  channelId: string,
  input: unknown,
): VideoResult<{ readonly titles: readonly string[]; readonly filter: string }> {
  if (channelById(deps.db, channelId) === undefined) return { ok: false, reason: "not-found" };
  const read = importOf(input);
  if (!read.ok) return read;
  const filter = storedFilter(readSetting(deps.db, filterKey(channelId)));
  return { ok: true, value: { titles: read.value.titles, filter } };
}

// Titles already on the channel (any case) and repeats within the import are skipped.
export function importChannelVideos(
  deps: ChannelVideoDeps,
  channelId: string,
  input: unknown,
): VideoResult<{ readonly added: number; readonly skipped: number }> {
  const read = importOf(input);
  if (!read.ok) return read;
  const { titles, filter } = read.value;
  return transact(deps.db, () => {
    if (channelById(deps.db, channelId) === undefined)
      return { ok: false, reason: "not-found" } as const;
    const at = deps.clock.now().toISOString();
    const insert = deps.db.prepare(
      "INSERT INTO channel_videos(id,channel_id,title,created_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING",
    );
    let added = 0;
    for (const title of titles)
      added += Number(insert.run(deps.uuid(), channelId, title, at).changes);
    if (filter !== undefined)
      writeSetting(deps.db, filterKey(channelId), JSON.stringify(filter.trim()));
    return { ok: true, value: { added, skipped: titles.length - added } } as const;
  });
}

// Stored as JSON, like every row of the `settings` table a backup carries.
function storedFilter(stored: string | undefined): string {
  if (stored === undefined) return "";
  try {
    const value: unknown = JSON.parse(stored);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function importOf(
  input: unknown,
): VideoResult<{ readonly titles: readonly string[]; readonly filter: string | undefined }> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "invalid-input", message: parsed.error.issues[0]?.message };
  const titles = (
    parsed.data.format === "csv"
      ? titlesFromCsv(parsed.data.text)
      : titlesFromLines(parsed.data.text)
  ).map((title) => title.slice(0, videoTitleMax));
  if (titles.length === 0)
    return {
      ok: false,
      reason: "invalid-input",
      message:
        parsed.data.format === "csv"
          ? "No video titles were found in this file. Export it from YouTube Studio → Analytics → Content (Export current view → Comma-separated values), or paste the titles one per line instead."
          : "Paste at least one video title, one per line.",
    };
  if (titles.length > importMax)
    return {
      ok: false,
      reason: "invalid-input",
      message: `This holds ${titles.length.toLocaleString("en")} titles; import at most ${importMax.toLocaleString("en")} at a time.`,
    };
  return { ok: true, value: { titles, filter: parsed.data.filter } };
}

export function deleteChannelVideo(
  deps: Pick<ChannelVideoDeps, "db">,
  channelId: string,
  videoId: string,
): VideoResult<{ readonly deleted: true }> {
  const changed = deps.db
    .prepare("DELETE FROM channel_videos WHERE id=? AND channel_id=?")
    .run(videoId, channelId);
  return Number(changed.changes) === 0
    ? { ok: false, reason: "not-found" }
    : { ok: true, value: { deleted: true } };
}

export function clearChannelVideos(
  deps: Pick<ChannelVideoDeps, "db">,
  channelId: string,
): VideoResult<{ readonly deleted: number }> {
  if (channelById(deps.db, channelId) === undefined) return { ok: false, reason: "not-found" };
  const changed = deps.db.prepare("DELETE FROM channel_videos WHERE channel_id=?").run(channelId);
  return { ok: true, value: { deleted: Number(changed.changes) } };
}

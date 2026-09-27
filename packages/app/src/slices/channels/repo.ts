import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  type BrandKit,
  type CastImage,
  type CastMember,
  type Channel,
  type ChannelSummary,
  castKinds,
  defaultChannelId,
} from "./model.js";

const brandSchema = z
  .object({
    captionFontId: z.string().optional(),
    captionColor: z.string().optional(),
    captionOutlineColor: z.string().optional(),
    titleFontId: z.string().optional(),
    titleColor: z.string().optional(),
    intro: z.string().optional(),
    outro: z.string().optional(),
    endScreenText: z.string().optional(),
    documentTheme: z.string().optional(),
    language: z.string().optional(),
  })
  .readonly();
const channelRow = z.object({
  id: z.string(),
  name: z.string(),
  is_default: z.number(),
  brand_json: z.string(),
  series_brief: z.string(),
  version: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
const memberRow = z.object({
  id: z.string(),
  channel_id: z.string(),
  kind: z.enum(castKinds),
  name: z.string(),
  aliases_json: z.string(),
  description: z.string(),
  voice_json: z.string().nullable().optional(),
  version: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
const voiceJson = z.object({
  provider: z.string(),
  model: z.string(),
  voice: z.string(),
  pace: z.number().optional(),
  pronunciations: z.string().optional(),
});
const imageRow = z.object({
  id: z.string(),
  member_id: z.string(),
  source: z.enum(["upload", "generate"]),
  prompt: z.string().nullable(),
  state: z.enum(["ready", "generating", "failed"]),
  error: z.string().nullable(),
  sha256: z.string().nullable(),
  created_at: z.string(),
});

function channelOf(row: unknown): Channel {
  const value = channelRow.parse(row);
  return {
    id: value.id,
    name: value.name,
    isDefault: value.is_default === 1,
    brand: brandSchema.parse(JSON.parse(value.brand_json)) as BrandKit,
    seriesBrief: value.series_brief,
    version: value.version,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

export function channelById(db: DatabaseSync, id: string): Channel | undefined {
  const row = db.prepare("SELECT * FROM channels WHERE id=?").get(id);
  return row === undefined ? undefined : channelOf(row);
}

// A channel id as stored on a template or project: NULL or one this install does not have
// reads as the default channel.
export function resolveChannelId(db: DatabaseSync, id: string | null | undefined): string {
  if (id === null || id === undefined) return defaultChannelId;
  return db.prepare("SELECT 1 FROM channels WHERE id=?").get(id) === undefined
    ? defaultChannelId
    : id;
}

export function channelSummaries(db: DatabaseSync): readonly ChannelSummary[] {
  const templates = counts(
    db,
    "SELECT coalesce(channel_id,'') AS id, count(*) AS n FROM project_templates GROUP BY channel_id",
  );
  const cast = counts(
    db,
    "SELECT channel_id AS id, count(*) AS n FROM cast_members GROUP BY channel_id",
  );
  const rows = db
    .prepare("SELECT * FROM channels ORDER BY is_default DESC, lower(name), id")
    .all()
    .map(channelOf);
  const known = new Set(rows.map((row) => row.id));
  // Templates naming no channel, or one that is gone, are the default channel's.
  const stray = [...templates.entries()]
    .filter(([id]) => !known.has(id))
    .reduce((sum, [, n]) => sum + n, 0);
  return rows.map((row) => ({
    ...row,
    templates: (templates.get(row.id) ?? 0) + (row.isDefault ? stray : 0),
    cast: cast.get(row.id) ?? 0,
  }));
}

function counts(db: DatabaseSync, sql: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of db.prepare(sql).all()) result.set(String(row.id), Number(row.n));
  return result;
}

export function castOfChannel(db: DatabaseSync, channelId: string): readonly CastMember[] {
  const members = db
    .prepare("SELECT * FROM cast_members WHERE channel_id=? ORDER BY lower(name), id")
    .all(channelId)
    .map((row) => memberRow.parse(row));
  const images = new Map<string, CastImage[]>();
  for (const row of db
    .prepare(
      "SELECT i.* FROM cast_images i JOIN cast_members m ON m.id=i.member_id WHERE m.channel_id=? ORDER BY i.created_at, i.rowid",
    )
    .all(channelId)) {
    const image = imageRow.parse(row);
    const list = images.get(image.member_id) ?? [];
    list.push(imageOf(image));
    images.set(image.member_id, list);
  }
  return members.map((row) => memberOf(row, images.get(row.id) ?? []));
}

export function castMemberById(db: DatabaseSync, id: string): CastMember | undefined {
  const row = db.prepare("SELECT * FROM cast_members WHERE id=?").get(id);
  if (row === undefined) return undefined;
  const images = db
    .prepare("SELECT * FROM cast_images WHERE member_id=? ORDER BY created_at, rowid")
    .all(id)
    .map((value) => imageOf(imageRow.parse(value)));
  return memberOf(memberRow.parse(row), images);
}

function memberOf(row: z.infer<typeof memberRow>, images: readonly CastImage[]): CastMember {
  return {
    id: row.id,
    channelId: row.channel_id,
    kind: row.kind,
    name: row.name,
    aliases: z.array(z.string()).parse(JSON.parse(row.aliases_json)),
    description: row.description,
    ...(row.voice_json === null || row.voice_json === undefined
      ? {}
      : { voice: voiceJson.parse(JSON.parse(row.voice_json)) }),
    version: row.version,
    images,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function imageOf(row: z.infer<typeof imageRow>): CastImage {
  return {
    id: row.id,
    source: row.source,
    prompt: row.prompt,
    state: row.state,
    error: row.error,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

export function templateChannelId(db: DatabaseSync, templateId: string): string {
  const row = db.prepare("SELECT channel_id FROM project_templates WHERE id=?").get(templateId);
  return resolveChannelId(db, typeof row?.channel_id === "string" ? row.channel_id : null);
}

// Every template's channel, for the lists that show or filter by it.
export function templateChannels(db: DatabaseSync): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const row of db.prepare("SELECT id, channel_id FROM project_templates").all())
    result.set(
      String(row.id),
      resolveChannelId(db, typeof row.channel_id === "string" ? row.channel_id : null),
    );
  return result;
}

// A schedule belongs to the channel of the template it runs, so moving a template moves its
// schedules with it and the series brief a schedule reads is always its channel's.
export function scheduleChannel(db: DatabaseSync, scheduleId: string): Channel | undefined {
  const row = db.prepare("SELECT template_id FROM schedules WHERE id=?").get(scheduleId);
  if (typeof row?.template_id !== "string") return undefined;
  return channelById(db, templateChannelId(db, row.template_id));
}

export function projectChannelId(db: DatabaseSync, projectId: string): string {
  const row = db
    .prepare("SELECT channel_id FROM project_channels WHERE project_id=?")
    .get(projectId);
  return resolveChannelId(db, typeof row?.channel_id === "string" ? row.channel_id : null);
}

export function setProjectChannel(db: DatabaseSync, projectId: string, channelId: string): void {
  db.prepare(
    "INSERT INTO project_channels(project_id,channel_id) VALUES (?,?) ON CONFLICT(project_id) DO UPDATE SET channel_id=excluded.channel_id",
  ).run(projectId, channelId);
}

export function imageBlob(
  db: DatabaseSync,
  sha256: string,
): { readonly bytes: Uint8Array; readonly mime: "image/png" | "image/jpeg" } | undefined {
  const row = db.prepare("SELECT mime, bytes FROM image_blobs WHERE sha256=?").get(sha256);
  if (row === undefined) return undefined;
  const mime = z.enum(["image/png", "image/jpeg"]).parse(row.mime);
  if (!(row.bytes instanceof Uint8Array)) return undefined;
  return { bytes: new Uint8Array(row.bytes), mime };
}

export function insertImageBlob(
  db: DatabaseSync,
  blob: { readonly sha256: string; readonly mime: string; readonly bytes: Uint8Array },
  at: string,
): void {
  db.prepare(
    "INSERT INTO image_blobs(sha256,mime,bytes,created_at) VALUES (?,?,?,?) ON CONFLICT(sha256) DO NOTHING",
  ).run(blob.sha256, blob.mime, blob.bytes, at);
}

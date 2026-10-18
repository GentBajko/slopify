import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  type PostState,
  type ProjectPostChoice,
  postStates,
  type RedditFields,
  type SocialPlatform,
  socialPlatforms,
} from "./model.js";
import { projectPostChoiceSchema, redditFieldsSchema } from "./schema.js";
import { noProgress, type PostProgress } from "./state.js";

export interface PostKey {
  readonly projectId: string;
  readonly platform: SocialPlatform;
  readonly item?: number | undefined;
}

// A project's post on one site as stored: its own pick, the hand edit, Reddit's fields and
// where it stands. A post without a row reads as none of them.
export interface PostRecord extends PostProgress {
  readonly projectId: string;
  readonly platform: SocialPlatform;
  readonly item: number;
  readonly choice: ProjectPostChoice | null;
  readonly textEdit: string | null;
  readonly textBase: string | null;
  readonly reddit: RedditFields | null;
  readonly updatedAt: string | null;
}

const columns =
  "project_id,platform,item,choice_json,text_edit,text_base,reddit_json,state,waiting_at,filled_at,scheduled_at,posted_at,url,message,by,updated_at";

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function json<T>(value: unknown, parse: (raw: unknown) => T | undefined): T | null {
  if (typeof value !== "string") return null;
  try {
    return parse(JSON.parse(value)) ?? null;
  } catch {
    return null;
  }
}

function toRecord(row: Record<string, unknown>): PostRecord | undefined {
  const platform = socialPlatforms.find((one) => one === row.platform);
  const state = postStates.find((one) => one === row.state) ?? "none";
  if (platform === undefined || typeof row.project_id !== "string") return undefined;
  const by = row.by === "extension" || row.by === "person" ? row.by : null;
  return {
    projectId: row.project_id,
    platform,
    item: typeof row.item === "number" ? row.item : 0,
    choice: json(row.choice_json, (raw) => {
      const parsed = projectPostChoiceSchema.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    }),
    textEdit: text(row.text_edit),
    textBase: text(row.text_base),
    reddit: json(row.reddit_json, (raw) => {
      const parsed = redditFieldsSchema.safeParse(raw);
      return parsed.success ? parsed.data : undefined;
    }),
    state,
    waitingAt: text(row.waiting_at),
    filledAt: text(row.filled_at),
    scheduledAt: text(row.scheduled_at),
    postedAt: text(row.posted_at),
    url: text(row.url),
    message: text(row.message),
    by,
    updatedAt: text(row.updated_at),
  };
}

function blank(key: PostKey): PostRecord {
  return {
    ...noProgress,
    projectId: key.projectId,
    platform: key.platform,
    item: key.item ?? 0,
    choice: null,
    textEdit: null,
    textBase: null,
    reddit: null,
    updatedAt: null,
  };
}

export function readPost(db: DatabaseSync, key: PostKey): PostRecord {
  const row = db
    .prepare(`SELECT ${columns} FROM social_posts WHERE project_id=? AND platform=? AND item=?`)
    .get(key.projectId, key.platform, key.item ?? 0);
  return (row === undefined ? undefined : toRecord(row)) ?? blank(key);
}

export function postsOf(db: DatabaseSync, projectId: string): readonly PostRecord[] {
  return db
    .prepare(`SELECT ${columns} FROM social_posts WHERE project_id=? ORDER BY platform, item`)
    .all(projectId)
    .flatMap((row) => toRecord(row) ?? []);
}

// Every post in one of these states, oldest first (by when it was asked to fill).
export function postsIn(
  db: DatabaseSync,
  states: readonly PostState[],
  platform?: SocialPlatform,
): readonly PostRecord[] {
  const marks = states.map(() => "?").join(",");
  const params: SQLInputValue[] = [...states];
  let where = `state IN (${marks})`;
  if (platform !== undefined) {
    where += " AND platform=?";
    params.push(platform);
  }
  return db
    .prepare(
      `SELECT ${columns} FROM social_posts WHERE ${where} ORDER BY coalesce(waiting_at, updated_at), rowid`,
    )
    .all(...params)
    .flatMap((row) => toRecord(row) ?? []);
}

type Fields = Partial<Record<(typeof writable)[number], SQLInputValue>>;
const writable = [
  "choice_json",
  "text_edit",
  "text_base",
  "reddit_json",
  "state",
  "waiting_at",
  "filled_at",
  "scheduled_at",
  "posted_at",
  "url",
  "message",
  "by",
] as const;

function upsert(db: DatabaseSync, key: PostKey, fields: Fields, now: Date): void {
  const names = writable.filter((name) => Object.hasOwn(fields, name));
  const values = names.map((name) => fields[name] ?? null);
  const updates = [
    ...names.map((name) => `${name}=excluded.${name}`),
    "updated_at=excluded.updated_at",
  ];
  db.prepare(
    `INSERT INTO social_posts (project_id,platform,item,${[...names, "updated_at"].join(",")})
     VALUES (?,?,?,${[...names, "updated_at"].map(() => "?").join(",")})
     ON CONFLICT(project_id,platform,item) DO UPDATE SET ${updates.join(",")}`,
  ).run(key.projectId, key.platform, key.item ?? 0, ...values, now.toISOString());
}

export function writeChoice(
  db: DatabaseSync,
  key: PostKey,
  choice: ProjectPostChoice | null,
  now: Date,
): void {
  upsert(db, key, { choice_json: choice === null ? null : JSON.stringify(choice) }, now);
}

// The person's text and the generated text it was edited from; null goes back to the
// generated text.
export function writeTextEdit(
  db: DatabaseSync,
  key: PostKey,
  edit: { readonly text: string; readonly base: string } | null,
  now: Date,
): void {
  upsert(db, key, { text_edit: edit?.text ?? null, text_base: edit?.base ?? null }, now);
}

export function writeReddit(db: DatabaseSync, key: PostKey, fields: RedditFields, now: Date): void {
  upsert(db, key, { reddit_json: JSON.stringify(fields) }, now);
}

export function writeProgress(
  db: DatabaseSync,
  key: PostKey,
  progress: PostProgress,
  now: Date,
): void {
  upsert(
    db,
    key,
    {
      state: progress.state,
      waiting_at: progress.waitingAt,
      filled_at: progress.filledAt,
      scheduled_at: progress.scheduledAt,
      posted_at: progress.postedAt,
      url: progress.url,
      message: progress.message,
      by: progress.by,
    },
    now,
  );
}

import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

// Episode memory: the short summary a finished project leaves on its channel
// (`summarize.ts`), read back into the article and script prompts of later related episodes
// (`related.ts`) while the channel's setting is on.

export interface EpisodeMemory {
  readonly id: string;
  readonly channelId: string;
  // The project it came from; the memory outlives the project.
  readonly projectId: string;
  readonly title: string;
  readonly summary: string;
  // The channel's cast members the episode mentions, by name.
  readonly cast: readonly string[];
  readonly source: "generated" | "edited";
  readonly createdAt: string;
  readonly updatedAt: string;
}

// What a new run carries of an earlier episode (`RunDraft.earlierEpisodes`).
export interface EarlierEpisode {
  readonly title: string;
  readonly summary: string;
}

const memoryRow = z.object({
  id: z.string(),
  channel_id: z.string(),
  project_id: z.string(),
  title: z.string(),
  summary: z.string(),
  cast_json: z.string(),
  source: z.enum(["generated", "edited"]),
  recipe: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

function memoryOf(row: unknown): EpisodeMemory & { readonly recipe: string | null } {
  const value = memoryRow.parse(row);
  return {
    id: value.id,
    channelId: value.channel_id,
    projectId: value.project_id,
    title: value.title,
    summary: value.summary,
    cast: z.array(z.string()).parse(JSON.parse(value.cast_json)),
    source: value.source,
    recipe: value.recipe,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function withoutRecipe(memory: EpisodeMemory & { readonly recipe: string | null }): EpisodeMemory {
  const { recipe: _recipe, ...rest } = memory;
  return rest;
}

// Newest first.
export function memoriesOfChannel(db: DatabaseSync, channelId: string): readonly EpisodeMemory[] {
  return db
    .prepare(
      "SELECT * FROM episode_memories WHERE channel_id=? ORDER BY created_at DESC, rowid DESC",
    )
    .all(channelId)
    .map((row) => withoutRecipe(memoryOf(row)));
}

export function memoryById(db: DatabaseSync, id: string): EpisodeMemory | undefined {
  const row = db.prepare("SELECT * FROM episode_memories WHERE id=?").get(id);
  return row === undefined ? undefined : withoutRecipe(memoryOf(row));
}

export function memoryOfProject(
  db: DatabaseSync,
  projectId: string,
): (EpisodeMemory & { readonly recipe: string | null }) | undefined {
  const row = db.prepare("SELECT * FROM episode_memories WHERE project_id=?").get(projectId);
  return row === undefined ? undefined : memoryOf(row);
}

// A project finished again replaces its generated summary in place, keeping its id and when
// it was first made.
export function saveGeneratedMemory(
  db: DatabaseSync,
  memory: {
    readonly id: string;
    readonly channelId: string;
    readonly projectId: string;
    readonly title: string;
    readonly summary: string;
    readonly cast: readonly string[];
    readonly recipe: string;
  },
  at: string,
): void {
  db.prepare(
    `INSERT INTO episode_memories(id,channel_id,project_id,title,summary,cast_json,source,recipe,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'generated',?,?,?)
     ON CONFLICT(project_id) DO UPDATE SET channel_id=excluded.channel_id,title=excluded.title,
       summary=excluded.summary,cast_json=excluded.cast_json,source='generated',
       recipe=excluded.recipe,updated_at=excluded.updated_at`,
  ).run(
    memory.id,
    memory.channelId,
    memory.projectId,
    memory.title,
    memory.summary,
    JSON.stringify(memory.cast),
    memory.recipe,
    at,
    at,
  );
}

export function episodeMemoryOn(db: DatabaseSync, channelId: string): boolean {
  const row = db.prepare("SELECT episode_memory FROM channels WHERE id=?").get(channelId);
  return row !== undefined && Number(row.episode_memory) === 1;
}

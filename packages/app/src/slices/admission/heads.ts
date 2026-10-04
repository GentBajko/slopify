import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { bookSchema } from "../voices/model.js";
import type { ListingConfig, ProjectHead } from "./model.js";
import { formats } from "./model.js";
import { liveProject } from "./repo.js";
import { runConfigSchema } from "./schema.js";

// Every live project for 07 Projects, Home and the command palette, newest first, with only the
// settings a list row reads. SQLite picks the three values out of the stored configuration, so
// a list never parses or sends a project's rendered prompts, provided text or episode memory.
const headRow = z.object({
  id: z.string(),
  title: z.string(),
  format: z.enum(formats),
  created_at: z.string(),
  updated_at: z.string(),
  paused: z.number().default(0),
  sources: z.string(),
  article_prompt: z.string().nullable(),
  book: z.string().nullable(),
});

const listingConfigSchema = z.object({
  sources: runConfigSchema.shape.sources,
  articlePrompt: z.string().optional(),
  voices: z.object({ book: bookSchema.optional() }).optional(),
});

const headSelect = `SELECT projects.id, projects.title, projects.format, projects.created_at,
  projects.updated_at, COALESCE(project_controls.paused, 0) AS paused,
  json_extract(projects.config, '$.sources') AS sources,
  json_extract(projects.config, '$.articlePrompt') AS article_prompt,
  json_extract(projects.config, '$.voices.book') AS book
  FROM projects LEFT JOIN project_controls ON project_controls.project_id = projects.id`;

export function listProjectHeads(db: DatabaseSync): ProjectHead[] {
  return db
    .prepare(`${headSelect} WHERE ${liveProject()} ORDER BY created_at DESC, id DESC`)
    .all()
    .map((raw) => {
      const row = headRow.parse(raw);
      return {
        id: row.id,
        title: row.title,
        format: row.format,
        config: listingConfigOf(row),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paused: row.paused === 1,
      };
    });
}

function listingConfigOf(row: z.infer<typeof headRow>): ListingConfig {
  const parsed = listingConfigSchema.parse({
    sources: JSON.parse(row.sources),
    ...(row.article_prompt === null ? {} : { articlePrompt: row.article_prompt }),
    ...(row.book === null ? {} : { voices: { book: JSON.parse(row.book) } }),
  });
  return {
    sources: parsed.sources,
    ...(parsed.articlePrompt === undefined ? {} : { articlePrompt: parsed.articlePrompt }),
    ...(parsed.voices?.book === undefined ? {} : { voices: { book: parsed.voices.book } }),
  };
}

import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { channelById } from "../channels/repo.js";
import { type EpisodeMemory, episodeMemoryOn, memoriesOfChannel, memoryById } from "./repo.js";
import { summaryWordsMax } from "./summarize.js";

// Channel page → Episodes: the setting and the memories, each viewable, editable and
// deletable. An edited summary is the user's: a later finish of its project never replaces it.

export interface EpisodeDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
}

export type EpisodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: "not-found" | "invalid-input";
      readonly message?: string | undefined;
    };

export interface ChannelEpisodes {
  readonly enabled: boolean;
  readonly memories: readonly EpisodeMemory[];
}

const settingSchema = z.object({ enabled: z.boolean() }).strict();
// Room for a hand-written summary a little longer than a generated one.
export const summaryCharsMax = 4000;
const editSchema = z
  .object({
    summary: z
      .string()
      .trim()
      .min(1, "Write the summary, or delete the memory instead.")
      .max(
        summaryCharsMax,
        `Keep the summary to ${summaryCharsMax.toLocaleString("en")} characters or fewer; about ${String(summaryWordsMax)} words is plenty.`,
      ),
  })
  .strict();

export function channelEpisodes(
  deps: Pick<EpisodeDeps, "db">,
  channelId: string,
): EpisodeResult<ChannelEpisodes> {
  if (channelById(deps.db, channelId) === undefined) return { ok: false, reason: "not-found" };
  return {
    ok: true,
    value: {
      enabled: episodeMemoryOn(deps.db, channelId),
      memories: memoriesOfChannel(deps.db, channelId),
    },
  };
}

export function setEpisodeMemory(
  deps: Pick<EpisodeDeps, "db">,
  channelId: string,
  input: unknown,
): EpisodeResult<ChannelEpisodes> {
  const parsed = settingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const changed = deps.db
    .prepare("UPDATE channels SET episode_memory=? WHERE id=?")
    .run(parsed.data.enabled ? 1 : 0, channelId);
  if (Number(changed.changes) === 0) return { ok: false, reason: "not-found" };
  return channelEpisodes(deps, channelId);
}

export function editMemory(
  deps: EpisodeDeps,
  channelId: string,
  memoryId: string,
  input: unknown,
): EpisodeResult<EpisodeMemory> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "invalid-input", message: parsed.error.issues[0]?.message };
  const changed = deps.db
    .prepare(
      "UPDATE episode_memories SET summary=?,source='edited',updated_at=? WHERE id=? AND channel_id=?",
    )
    .run(parsed.data.summary, deps.clock.now().toISOString(), memoryId, channelId);
  const saved = memoryById(deps.db, memoryId);
  if (Number(changed.changes) === 0 || saved === undefined)
    return { ok: false, reason: "not-found" };
  return { ok: true, value: saved };
}

export function deleteMemory(
  deps: Pick<EpisodeDeps, "db">,
  channelId: string,
  memoryId: string,
): EpisodeResult<{ readonly deleted: true }> {
  const changed = deps.db
    .prepare("DELETE FROM episode_memories WHERE id=? AND channel_id=?")
    .run(memoryId, channelId);
  return Number(changed.changes) === 0
    ? { ok: false, reason: "not-found" }
    : { ok: true, value: { deleted: true } };
}

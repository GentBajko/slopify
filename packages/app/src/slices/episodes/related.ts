import type { DatabaseSync } from "node:sqlite";
import type { RunDraft } from "../admission/model.js";
import { castMentions } from "../channels/cast-match.js";
import type { CastSnapshot } from "../channels/model.js";
import { castOfChannel, resolveChannelId } from "../channels/repo.js";
import { normaliseTopic, topicWords } from "../schedules/similar.js";
import {
  type EarlierEpisode,
  type EpisodeMemory,
  episodeMemoryOn,
  memoriesOfChannel,
} from "./repo.js";

// At most this many earlier episodes go into a new episode's prompt.
export const earlierEpisodesMax = 5;
// A shared cast member counts for more than any number of shared title words: the same
// character is the strongest sign two episodes must agree.
const castWeight = 100;

// The earlier episodes of the same channel related to a new one: they share a cast member the
// new title or keyword values mention, or words of their titles. Most related first, the
// newest first among equals. An episode with the same title as the new one is a remake of it,
// not an earlier episode, and is left out.
export function relatedEpisodes(
  memories: readonly EpisodeMemory[],
  cast: readonly CastSnapshot[],
  subject: string,
  title: string,
): readonly EpisodeMemory[] {
  const mentioned = new Set(castMentions(subject, cast).map((member) => member.name.toLowerCase()));
  const titles = memories.map((memory) => titleWords(memory.title));
  // A word most of the channel's titles share is the template's ("History: …"), not the
  // topic's, and relates nothing.
  const seen = new Map<string, number>();
  for (const set of titles) for (const word of set) seen.set(word, (seen.get(word) ?? 0) + 1);
  const common = (word: string): boolean => {
    const count = seen.get(word) ?? 0;
    return count >= 2 && count / memories.length > 0.5;
  };
  const words = titleWords(subject);
  const same = normaliseTopic(title);
  return memories
    .flatMap((memory, order) => {
      if (same !== "" && normaliseTopic(memory.title) === same) return [];
      const sharedCast = memory.cast.filter((name) => mentioned.has(name.toLowerCase())).length;
      let sharedWords = 0;
      for (const word of titles[order] ?? [])
        if (words.has(word) && !common(word)) sharedWords += 1;
      const score = sharedCast * castWeight + sharedWords;
      return score === 0 ? [] : [{ memory, score, order }];
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, earlierEpisodesMax)
    .map((row) => row.memory);
}

// A title's words as the topic checks compare them, less the one- and two-letter ones ("R&D"
// is "d and d"), which relate nothing.
function titleWords(text: string): ReadonlySet<string> {
  return new Set([...topicWords(text)].filter((word) => word.length > 2 || /\d/.test(word)));
}

// The earlier episodes a new run carries, copied into its config when it starts so a later
// edit or a new memory never changes a project already made. Only for a run that writes its
// article (or script) on a channel with episode memory on; undefined otherwise, so the config
// is exactly what it was before episode memory.
export function earlierEpisodesFor(
  db: DatabaseSync,
  draft: Pick<RunDraft, "channelId" | "sources" | "values">,
  title: string,
): readonly EarlierEpisode[] | undefined {
  if (draft.sources.article !== "generate") return undefined;
  const channelId = resolveChannelId(db, draft.channelId);
  if (!episodeMemoryOn(db, channelId)) return undefined;
  const memories = memoriesOfChannel(db, channelId);
  if (memories.length === 0) return undefined;
  const cast: CastSnapshot[] = castOfChannel(db, channelId).map((member) => ({
    name: member.name,
    aliases: member.aliases,
    description: member.description,
    images: [],
  }));
  const subject = [title, ...Object.values(draft.values)].join("\n");
  const related = relatedEpisodes(memories, cast, subject, title);
  return related.length === 0
    ? undefined
    : related.map((memory) => ({ title: memory.title, summary: memory.summary }));
}

// The block appended to the article (or script) prompt. The prompt comes back unchanged when
// the run carries no earlier episodes, so every project made before episode memory, or with it
// off, sends exactly what it always sent.
export function withEarlierEpisodes(
  prompt: string,
  episodes: readonly EarlierEpisode[] | undefined,
): string {
  if (episodes === undefined || episodes.length === 0) return prompt;
  return [
    prompt,
    "",
    "Earlier episodes",
    "",
    "This channel has already made these related episodes. Stay consistent with them and never contradict them; refer back to one where it fits naturally, but don't retell it.",
    "",
    ...episodes.map((episode) => `- "${episode.title}": ${episode.summary.replace(/\s+/g, " ")}`),
  ].join("\n");
}

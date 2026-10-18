import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { InterestResult, TopicInterest } from "../../kernel/ports/interest.js";
import type { TopicScoring } from "./schema.js";
import {
  type InterestReading,
  noveltyOf,
  orderQueue,
  readingOf,
  type TopicScore,
  topicKey,
  topicScore,
} from "./score.js";
import type { KnownTitles } from "./similar.js";

// ceiling: three topics asked at once, and the whole scoring of one generation stops after
// 15 seconds; what wasn't read by then is scored by novelty alone, never held up.
const concurrency = 3;
export const scoringBudgetMs = 15_000;

export interface StoredScore {
  readonly title: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly pinned: boolean;
}

const scoreRow = z.object({
  topic_key: z.string(),
  title: z.string(),
  score: z.number(),
  reasons: z.string(),
  pinned: z.number(),
});

export function scoresOf(db: DatabaseSync, scheduleId: string): ReadonlyMap<string, StoredScore> {
  return new Map(
    db
      .prepare("SELECT topic_key,title,score,reasons,pinned FROM topic_scores WHERE schedule_id=?")
      .all(scheduleId)
      .map((raw) => {
        const row = scoreRow.parse(raw);
        return [
          row.topic_key,
          {
            title: row.title,
            score: row.score,
            reasons: z.array(z.string()).parse(JSON.parse(row.reasons)),
            pinned: row.pinned === 1,
          },
        ] as const;
      }),
  );
}

// A topic scored again keeps whether the person pinned it. `pinNew` scores topics that had no
// score (ones the person added) without moving them.
export function saveScores(
  db: DatabaseSync,
  scheduleId: string,
  scores: ReadonlyMap<string, TopicScore>,
  at: string,
  pinNew = false,
): void {
  const upsert = db.prepare(
    `INSERT INTO topic_scores (schedule_id,topic_key,title,score,interest,novelty,reasons,pinned,scored_at)
     VALUES (?,?,?,?,?,?,?,${pinNew ? 1 : 0},?)
     ON CONFLICT(schedule_id,topic_key) DO UPDATE SET title=excluded.title,score=excluded.score,
       interest=excluded.interest,novelty=excluded.novelty,reasons=excluded.reasons,
       scored_at=excluded.scored_at`,
  );
  for (const [title, score] of scores)
    upsert.run(
      scheduleId,
      topicKey(title),
      title,
      score.score,
      score.interest,
      score.novelty,
      JSON.stringify(score.reasons),
      at,
    );
}

// A topic the person moved stays where they put it.
export function pinTopic(db: DatabaseSync, scheduleId: string, title: string): void {
  db.prepare("UPDATE topic_scores SET pinned=1 WHERE schedule_id=? AND topic_key=?").run(
    scheduleId,
    topicKey(title),
  );
}

// The queue in score order (`orderQueue`), from the scores kept for it.
export function rankedItems<T extends { readonly title: string }>(
  db: DatabaseSync,
  scheduleId: string,
  items: readonly T[],
): readonly T[] {
  return orderQueue(items, scoresOf(db, scheduleId));
}

// Scores each title: its novelty against the library, and with "search" its public interest.
// "library" never asks anything outside this computer. Never throws: a topic search didn't
// answer for in time is scored by novelty and says so.
export async function scoreTopics(
  deps: { readonly interest?: TopicInterest | undefined },
  scoring: Exclude<TopicScoring, "off">,
  titles: readonly string[],
  known: KnownTitles,
  language: string,
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, TopicScore>> {
  const readings = new Map<string, InterestResult>();
  const interest = deps.interest;
  if (scoring === "search" && interest !== undefined) {
    const budget = AbortSignal.any([
      AbortSignal.timeout(scoringBudgetMs),
      ...(signal === undefined ? [] : [signal]),
    ]);
    const queue = [...titles];
    const worker = async (): Promise<void> => {
      for (let title = queue.shift(); title !== undefined; title = queue.shift()) {
        if (budget.aborted) return;
        try {
          readings.set(title, await interest(title, language, budget));
        } catch {
          // The port never throws; a broken adapter is treated as no connection.
        }
      }
    };
    await Promise.race([
      Promise.all(Array.from({ length: concurrency }, worker)),
      new Promise<void>((resolve) =>
        budget.addEventListener("abort", () => resolve(), { once: true }),
      ),
    ]);
  }
  return new Map(
    titles.map((title) => {
      // A queued topic is in the library's list itself; it is compared with the others.
      const novelty = noveltyOf(title, {
        topics: known.topics.filter((other) => topicKey(other) !== topicKey(title)),
        projects: known.projects,
      });
      if (scoring === "library") return [title, topicScore(novelty, null, "off")] as const;
      const result = readings.get(title);
      const reading: InterestReading | null = result?.ok === true ? readingOf(title, result) : null;
      return [
        title,
        topicScore(novelty, reading, reading === null ? "unreachable" : "read"),
      ] as const;
    }),
  );
}

// The scores kept for these titles, by key, as the schedule page and agents read them.
export function scoresFor(
  db: DatabaseSync,
  scheduleId: string,
  titles: readonly string[],
): Readonly<Record<string, { readonly score: number; readonly reasons: readonly string[] }>> {
  const kept = scoresOf(db, scheduleId);
  return Object.fromEntries(
    titles.flatMap((title) => {
      const found = kept.get(topicKey(title));
      return found === undefined
        ? []
        : [[topicKey(title), { score: found.score, reasons: found.reasons }] as const];
    }),
  );
}

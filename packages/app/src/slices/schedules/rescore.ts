import { transact } from "../../kernel/db/tx.js";
import type { ScheduleDeps, ScheduleResult } from "./model.js";
import { scheduleById } from "./repo.js";
import type { ScheduleSummary } from "./schema.js";
import { rankedItems, saveScores, scoreTopics } from "./topic-scores.js";
import { heldTopics, knownTitles, rankHeld } from "./topics.js";

export type RescoreResult =
  | ScheduleResult<ScheduleSummary>
  | { readonly ok: false; readonly reason: "scoring-off"; readonly message: string };

// Rescore: every queued and held topic scored again now, then the queue and the held list put
// in score order. Topics the person added or moved keep their places: one scored for the first
// time here is scored where it stands.
export async function rescoreTopics(
  deps: ScheduleDeps,
  scheduleId: string,
  signal?: AbortSignal,
): Promise<RescoreResult> {
  const schedule = scheduleById(deps.db, scheduleId);
  if (schedule === undefined || schedule.deletedAt !== null)
    return { ok: false, reason: "not-found" };
  if (schedule.topicScoring === "off")
    return {
      ok: false,
      reason: "scoring-off",
      message:
        "Topic ranking is off for this schedule. Choose how to rank topics under Edit → Topic generation → Rank topics, save, then rescore.",
    };
  const titles = [
    ...schedule.items.map((item) => item.title),
    ...heldTopics(deps, scheduleId).map((topic) => topic.title),
  ];
  const scores = await scoreTopics(
    deps,
    schedule.topicScoring,
    titles,
    knownTitles(deps, scheduleId),
    deps.template(schedule.templateId)?.document.form.language ?? "en",
    signal,
  );
  return transact(deps.db, (): RescoreResult => {
    const current = scheduleById(deps.db, scheduleId);
    if (current === undefined || current.deletedAt !== null)
      return { ok: false, reason: "not-found" };
    const at = deps.clock.now().toISOString();
    saveScores(deps.db, scheduleId, scores, at, true);
    deps.db
      .prepare(
        "UPDATE schedules SET items_json=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      )
      .run(
        JSON.stringify(rankedItems(deps.db, scheduleId, current.items)),
        at,
        scheduleId,
        current.version,
      );
    rankHeld(deps, scheduleId);
    return { ok: true, value: scheduleById(deps.db, scheduleId) as ScheduleSummary };
  });
}

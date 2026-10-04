import { transact } from "../../kernel/db/tx.js";
import type { ScheduleDeps, ScheduleResult } from "./model.js";
import { scheduleById } from "./repo.js";
import type { ScheduleSummary } from "./schema.js";
import { writeHeldValues } from "./topics.js";

// Held topics decided several at a time: Reject selected (or Reject all, as the ids shown),
// and its Undo, which puts turned-down topics back to wait with the keywords they had.

function liveSchedule(
  deps: Pick<ScheduleDeps, "db">,
  scheduleId: string,
): ScheduleResult<ScheduleSummary> {
  const schedule = scheduleById(deps.db, scheduleId);
  if (schedule === undefined || schedule.deletedAt !== null)
    return { ok: false, reason: "not-found" };
  if (schedule.status === "canceled" || schedule.status === "completed")
    return { ok: false, reason: "conflict" };
  return { ok: true, value: schedule };
}

// Every id must still be waiting, or nothing is turned down: the list on screen was stale.
export function rejectHeldTopics(
  deps: Pick<ScheduleDeps, "db" | "clock">,
  scheduleId: string,
  ids: readonly string[],
): ScheduleResult<ScheduleSummary> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { ok: false, reason: "invalid-input" };
  return batch(deps, () => {
    const open = liveSchedule(deps, scheduleId);
    if (!open.ok) return open;
    const at = deps.clock.now().toISOString();
    const reject = deps.db.prepare(
      `UPDATE schedule_topics SET state='rejected',decided_at=?
       WHERE id=? AND schedule_id=? AND state='held'`,
    );
    for (const id of unique)
      if (Number(reject.run(at, id, scheduleId).changes) !== 1) throw new TopicGone();
    writeHeldValues(deps.db);
    return { ok: true, value: scheduleById(deps.db, scheduleId) as ScheduleSummary };
  });
}

// Turned-down topics wait again, each with the keywords it had (`values`, from the list the
// person saw), in its old place.
export function restoreRejectedTopics(
  deps: Pick<ScheduleDeps, "db">,
  scheduleId: string,
  topics: readonly {
    readonly id: string;
    readonly values?: Readonly<Record<string, string>> | undefined;
  }[],
): ScheduleResult<ScheduleSummary> {
  if (topics.length === 0) return { ok: false, reason: "invalid-input" };
  return batch(deps, () => {
    const open = liveSchedule(deps, scheduleId);
    if (!open.ok) return open;
    const restore = deps.db.prepare(
      `UPDATE schedule_topics SET state='held',decided_at=NULL
       WHERE id=? AND schedule_id=? AND state='rejected'`,
    );
    for (const topic of topics)
      if (Number(restore.run(topic.id, scheduleId).changes) !== 1) throw new TopicGone();
    writeHeldValues(deps.db, (stored) => ({
      ...stored,
      ...Object.fromEntries(
        topics.flatMap((topic) =>
          topic.values === undefined ? [] : [[topic.id, { ...topic.values }] as const],
        ),
      ),
    }));
    return { ok: true, value: scheduleById(deps.db, scheduleId) as ScheduleSummary };
  });
}

// Thrown inside the transaction so a half-done batch rolls back.
class TopicGone extends Error {}

function batch<T>(deps: Pick<ScheduleDeps, "db">, run: () => ScheduleResult<T>): ScheduleResult<T> {
  try {
    return transact(deps.db, run);
  } catch (error) {
    if (error instanceof TopicGone) return { ok: false, reason: "topic-not-found" };
    throw error;
  }
}

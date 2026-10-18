import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { Log } from "../../kernel/log.js";
import { webhookBody } from "../notifications/address.js";
import { type SendNotification, sendFailureText } from "../notifications/send.js";
import { readNotificationUrl } from "../notifications/settings.js";
import { markWeeklySent, weeklyNotifyOf, weeklySentFor } from "./repo.js";
import { weeklyDue, weeklyNoticeText, weeklyReport } from "./weekly.js";

const weekMs = 7 * 24 * 60 * 60_000;

// The Monday report, sent to the Notification URL once a week while Weekly report is on. A
// send that fails is tried again at the next check; one that went out is not sent again.
export async function sendWeeklyReport(deps: {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly send: SendNotification;
  readonly log: Pick<Log, "write">;
  readonly timeZone: string;
}): Promise<"sent" | "not-due" | "off" | "no-url" | "failed"> {
  if (!weeklyNotifyOf(deps.db)) return "off";
  const now = deps.clock.now();
  const { due, week } = weeklyDue(now, deps.timeZone, weeklySentFor(deps.db));
  if (!due) return "not-due";
  const url = readNotificationUrl(deps.db);
  if (url === null) return "no-url";
  const report = weeklyReport(
    deps.db,
    new Date(now.valueOf() - weekMs).toISOString(),
    now.toISOString(),
  );
  const result = await deps.send(url, webhookBody(weeklyNoticeText(report)));
  if (!result.ok) {
    deps.log.write("warn", "autopilot.weekly", { detail: sendFailureText(result) });
    return "failed";
  }
  markWeeklySent(deps.db, week);
  return "sent";
}

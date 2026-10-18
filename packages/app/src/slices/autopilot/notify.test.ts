import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { SendResult } from "../notifications/send.js";
import { saveNotificationUrl } from "../notifications/settings.js";
import { sendWeeklyReport } from "./notify.js";
import { setWeeklyNotify, weeklySentFor } from "./repo.js";

// Monday 2026-10-19 10:00 UTC.
const clock = fixedClock("2026-10-19T10:00:00.000Z");

function harness(answer: SendResult = { ok: true }) {
  const db = openDb(":memory:");
  migrate(db, clock);
  const sent: { url: string; body: string }[] = [];
  const logged: string[] = [];
  const deps = {
    db,
    clock,
    timeZone: "UTC",
    log: {
      write: () => {
        logged.push("logged");
      },
    },
    send: async (url: string, body: string) => {
      sent.push({ url, body });
      return answer;
    },
  };
  return { db, deps, sent, logged };
}

it("sends nothing while Weekly report is off, which it is by default", async () => {
  const h = harness();
  saveNotificationUrl(h.db, "https://ntfy.sh/slopify-test");
  expect(await sendWeeklyReport(h.deps)).toBe("off");
  expect(h.sent).toEqual([]);
});

it("sends last week's report once a week to the Notification URL", async () => {
  const h = harness();
  saveNotificationUrl(h.db, "https://ntfy.sh/slopify-test");
  setWeeklyNotify(h.db, true);
  expect(await sendWeeklyReport(h.deps)).toBe("sent");
  expect(await sendWeeklyReport(h.deps)).toBe("not-due");
  expect(h.sent).toHaveLength(1);
  expect(h.sent[0]?.url).toBe("https://ntfy.sh/slopify-test");
  expect(h.sent[0]?.body.split("\n")[0]).toBe("Slopify last week: 0 videos made, 0 steps failed");
  expect(weeklySentFor(h.db)).toBe("2026-W43");
});

it("waits for a Notification URL, and tries a failed send again at the next check", async () => {
  const h = harness({ ok: false, reason: "unreachable" });
  setWeeklyNotify(h.db, true);
  expect(await sendWeeklyReport(h.deps)).toBe("no-url");
  saveNotificationUrl(h.db, "https://ntfy.sh/slopify-test");
  expect(await sendWeeklyReport(h.deps)).toBe("failed");
  expect(weeklySentFor(h.db)).toBeUndefined();
  expect(h.logged).toHaveLength(1);
});

import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { isoWeekOf, weeklyDue, weeklyNoticeText, weeklyReport } from "./weekly.js";

function seeded() {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-10-18T10:00:00.000Z"));
  db.exec("INSERT INTO channels (id, name, created_at, updated_at) VALUES ('c2','Other','a','a')");
  for (const [id, title] of [
    ["p1", "Rope"],
    ["p2", ""],
    ["p3", "Elsewhere"],
    ["p4", "Old"],
  ] as const)
    db.prepare("INSERT INTO projects VALUES (?,?,'16:9','{}','a','a')").run(id, title);
  db.exec("INSERT INTO project_channels VALUES ('p3','c2')");
  const stage = db.prepare(
    "INSERT INTO stages (id,project_id,kind,source,state,failure_reason,finished_at) VALUES (?,?,?,'generate',?,?,?)",
  );
  stage.run(
    "s1",
    "p1",
    "audio",
    "failed",
    "The voice refused the text.",
    "2026-10-17T10:00:00.000Z",
  );
  stage.run("s2", "p2", "images", "failed", null, "2026-10-16T10:00:00.000Z");
  stage.run("s3", "p3", "video", "failed", "Out of disk.", "2026-10-15T10:00:00.000Z");
  stage.run("s4", "p4", "video", "failed", "Long ago.", "2026-10-01T10:00:00.000Z");
  stage.run("s5", "p1", "video", "done", null, "2026-10-17T11:00:00.000Z");
  return db;
}

describe("weeklyReport", () => {
  it("lists the week's failed steps newest first, by channel when asked", () => {
    const db = seeded();
    const report = weeklyReport(db, "2026-10-11T10:00:00.000Z", "2026-10-18T10:00:00.000Z");
    expect(report.failed).toEqual([
      { projectId: "p1", title: "Rope", stage: "Narration", reason: "The voice refused the text." },
      {
        projectId: "p2",
        title: "Untitled project",
        stage: "Images",
        reason: "It stopped without a reason.",
      },
      { projectId: "p3", title: "Elsewhere", stage: "Video", reason: "Out of disk." },
    ]);
    expect(report).toMatchObject({ finished: 0, cost: 0, failedMore: 0 });
    expect(
      weeklyReport(db, "2026-10-11T10:00:00.000Z", "2026-10-18T10:00:00.000Z", "c2").failed.map(
        (one) => one.projectId,
      ),
    ).toEqual(["p3"]);
  });

  it("names ten failed steps and counts the rest", () => {
    const db = seeded();
    for (let n = 0; n < 12; n++) {
      db.prepare("INSERT INTO projects VALUES (?,?,'16:9','{}','a','a')").run(`x${String(n)}`, "X");
      db.prepare(
        "INSERT INTO stages (id,project_id,kind,source,state,failure_reason,finished_at) VALUES (?,?,'article','generate','failed','No.','2026-10-17T12:00:00.000Z')",
      ).run(`xs${String(n)}`, `x${String(n)}`);
    }
    const report = weeklyReport(db, "2026-10-11T10:00:00.000Z", "2026-10-18T10:00:00.000Z");
    expect(report.failed).toHaveLength(10);
    expect(report.failedMore).toBe(5);
  });
});

describe("weeklyDue", () => {
  it("is due from Monday 09:00 in the person's time zone, once a week", () => {
    // Monday 2026-10-19 08:30 in Berlin is 06:30 UTC.
    expect(weeklyDue(new Date("2026-10-19T06:30:00.000Z"), "Europe/Berlin", "2026-W42")).toEqual({
      due: false,
      week: "2026-W43",
    });
    expect(weeklyDue(new Date("2026-10-19T07:00:00.000Z"), "Europe/Berlin", "2026-W42")).toEqual({
      due: true,
      week: "2026-W43",
    });
    expect(weeklyDue(new Date("2026-10-21T12:00:00.000Z"), "Europe/Berlin", "2026-W43").due).toBe(
      false,
    );
    // Off on Monday: sent when it runs on Wednesday.
    expect(weeklyDue(new Date("2026-10-21T12:00:00.000Z"), "Europe/Berlin", "2026-W42").due).toBe(
      true,
    );
    expect(weeklyDue(new Date("2026-10-19T07:00:00.000Z"), "Europe/Berlin", undefined).due).toBe(
      true,
    );
  });

  it("reads the week at the zone's own midnight, and falls back to UTC for an unknown zone", () => {
    // Sunday 23:30 UTC is Monday 01:30 in Berlin.
    expect(isoWeekOf(new Date("2026-10-18T23:30:00.000Z"), "UTC")).toBe("2026-W42");
    expect(isoWeekOf(new Date("2026-10-18T23:30:00.000Z"), "Europe/Berlin")).toBe("2026-W43");
    expect(isoWeekOf(new Date("2026-10-18T23:30:00.000Z"), "Mars/Base")).toBe("2026-W42");
  });
});

describe("weeklyNoticeText", () => {
  it("says what was made, what failed and what it cost", () => {
    expect(
      weeklyNoticeText({
        since: "a",
        until: "b",
        finished: 5,
        failed: [
          {
            projectId: "p1",
            title: "Rope",
            stage: "Narration",
            reason: "The voice refused the text.",
          },
        ],
        failedMore: 0,
        cost: 3.2,
        unpriced: 2,
        apiEquivalent: null,
        plans: [
          { name: "Claude", weeklyPercent: 34.4, fiveHourPercent: 1 },
          { name: "Codex", weeklyPercent: null, fiveHourPercent: null },
        ],
      }),
    ).toEqual({
      headline: "Slopify last week: 5 videos made, 1 step failed",
      detail:
        "Cost $3.20 plus 2 calls with no known price. Plans: Claude 34% of its week. Failed: “Rope” (Narration): The voice refused the text. Open each project and use the button beside the failed step.",
    });
  });
});

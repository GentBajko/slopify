import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { emptyPlan, nextOccurrence, type PostingPlan, zonedInstant } from "./plan.js";
import { seriesOf } from "./plan-model.js";
import {
  freeSlots,
  planReleases,
  releasesOf,
  scheduleOf,
  setRelease,
  swapReleases,
  writeLeadHours,
} from "./releases.js";

// A three-videos-a-week plan, five shorts each.
const at = (day: number, time: string) => ({ day, time });
const plan: PostingPlan = {
  timeZone: "Europe/Berlin",
  rows: [
    {
      name: "1",
      series: "",
      long: at(0, "20:00"),
      shorts: [at(1, "00:00"), at(1, "17:00"), at(2, "00:00"), at(2, "17:00"), at(3, "17:00")],
    },
    {
      name: "2",
      series: "",
      long: at(2, "20:00"),
      shorts: [at(3, "00:00"), at(4, "00:00"), at(4, "17:00"), at(5, "17:00"), at(6, "17:00")],
    },
    {
      name: "3",
      series: "",
      long: at(4, "20:00"),
      shorts: [at(5, "00:00"), at(6, "00:00"), at(6, "21:00"), at(0, "00:00"), at(0, "17:00")],
    },
  ],
};

it("names a wall-clock time in the plan's zone, across a clock change", () => {
  // 20:00 in Berlin is 18:00 UTC in summer time and 19:00 UTC in winter time.
  expect(
    zonedInstant(
      "Europe/Berlin",
      { year: 2026, month: 10, day: 4, weekday: 0 },
      "20:00",
    ).toISOString(),
  ).toBe("2026-10-04T18:00:00.000Z");
  expect(
    zonedInstant(
      "Europe/Berlin",
      { year: 2026, month: 11, day: 1, weekday: 0 },
      "20:00",
    ).toISOString(),
  ).toBe("2026-11-01T19:00:00.000Z");
  // New York: 14:00 is 18:00 UTC in daylight time.
  expect(
    zonedInstant(
      "America/New_York",
      { year: 2026, month: 10, day: 4, weekday: 0 },
      "14:00",
    ).toISOString(),
  ).toBe("2026-10-04T18:00:00.000Z");
});

function db() {
  const one = openDb(":memory:");
  migrate(one, fixedClock("2026-10-02T10:00:00.000Z"));
  for (const id of ["p1", "p2", "p3"])
    one
      .prepare("INSERT INTO projects VALUES (?, ?, '16:9', '{}', 'old', 'old')")
      .run(id, `Project ${id}`);
  writeLeadHours(one, 24);
  return one;
}
// Friday 2 October 2026, noon in Berlin.
const now = new Date("2026-10-02T10:00:00Z");

it("gives each finished project the next free long-video time, in time order", () => {
  const store = db();
  for (const id of ["p1", "p2", "p3"])
    planReleases(store, plan, { id, series: "", shorts: 0 }, now);
  expect(["p1", "p2", "p3"].map((id) => scheduleOf(store, id)?.longAt)).toEqual([
    "2026-10-04T18:00:00.000Z",
    "2026-10-06T18:00:00.000Z",
    "2026-10-08T18:00:00.000Z",
  ]);
  expect(freeSlots(store, plan, { series: "" }, now, 1)).toEqual([
    { row: "1", longAt: "2026-10-11T18:00:00.000Z" },
  ]);
});

it("puts each short at the first time its day and hour come round after its own video", () => {
  const store = db();
  setRelease(store, "p1", 0, "2026-10-08T18:00:00.000Z", "3", now);
  planReleases(store, plan, { id: "p1", series: "", shorts: 5 }, now);
  expect(scheduleOf(store, "p1")?.shortsAt).toEqual([
    "2026-10-08T22:00:00.000Z", // Fri 00:00
    "2026-10-09T22:00:00.000Z", // Sat 00:00
    "2026-10-10T19:00:00.000Z", // Sat 21:00
    "2026-10-10T22:00:00.000Z", // Sun 00:00, the following Sunday
    "2026-10-11T15:00:00.000Z", // Sun 17:00
  ]);
  expect(
    nextOccurrence(
      "Europe/Berlin",
      { day: 4, time: "20:00" },
      new Date("2026-10-08T18:00:00Z"),
    ).toISOString(),
  ).toBe("2026-10-15T18:00:00.000Z");
});

it("never puts two releases in the same hour, and gives a video as many shorts as it has", () => {
  const store = db();
  // Two videos on the same line in consecutive weeks: the second's shorts can't take hours
  // the first's already hold.
  setRelease(store, "p1", 0, "2026-10-04T18:00:00.000Z", "1", now);
  planReleases(store, plan, { id: "p1", series: "", shorts: 7 }, now);
  setRelease(store, "p2", 0, "2026-10-06T18:00:00.000Z", "2", now);
  planReleases(store, plan, { id: "p2", series: "", shorts: 2 }, now);
  const hours = [scheduleOf(store, "p1"), scheduleOf(store, "p2")].flatMap((one) => [
    one?.longAt,
    ...(one?.shortsAt ?? []),
  ]);
  expect(scheduleOf(store, "p1")?.shortsAt).toHaveLength(7);
  expect(scheduleOf(store, "p2")?.shortsAt).toHaveLength(2);
  expect(new Set(hours.map((at) => at?.slice(0, 13))).size).toBe(hours.length);
});

it("keeps a line's series: a project takes only lines of its series or any", () => {
  const store = db();
  const mixed: PostingPlan = {
    timeZone: "Europe/Berlin",
    rows: [
      { name: "1", series: "Games Lore", long: { day: 0, time: "20:00" }, shorts: [] },
      { name: "2", series: "", long: { day: 2, time: "20:00" }, shorts: [] },
    ],
  };
  planReleases(store, mixed, { id: "p1", series: "Card Lore", shorts: 0 }, now);
  planReleases(store, mixed, { id: "p2", series: "Games Lore", shorts: 0 }, now);
  expect(scheduleOf(store, "p1")?.longAt).toBe("2026-10-06T18:00:00.000Z");
  expect(scheduleOf(store, "p2")?.longAt).toBe("2026-10-04T18:00:00.000Z");
  expect(seriesOf({ title: "A Tale | Games Lore" })).toBe("Games Lore");
  expect(seriesOf({ title: "x", titlePattern: "{{Topic}} | Card Lore {{Year}}" })).toBe(
    "Card Lore",
  );
  expect(seriesOf({ title: "No series" })).toBe("");
});

it("leaves a project set to not scheduled alone, and re-plans shorts when its video moves", () => {
  const store = db();
  setRelease(store, "p1", 0, "", null, now);
  planReleases(store, plan, { id: "p1", series: "", shorts: 2 }, now);
  expect(scheduleOf(store, "p1")).toBeUndefined();
  setRelease(store, "p2", 0, "2026-10-04T18:00:00.000Z", "1", now);
  planReleases(store, plan, { id: "p2", series: "", shorts: 2 }, now);
  setRelease(store, "p2", 1, "2026-10-05T09:00:00.000Z", "1", now);
  setRelease(store, "p2", 0, "2026-10-11T18:00:00.000Z", "1", now);
  // Short 2's plan-placed time is dropped to be planned again; the hand-set short stays.
  expect(releasesOf(store, "p2").map((one) => [one.short, one.at, one.by])).toEqual([
    [0, "2026-10-11T18:00:00.000Z", "person"],
    [1, "2026-10-05T09:00:00.000Z", "person"],
  ]);
});

it("has no plan until one is made, so nothing is scheduled", () => {
  const store = db();
  planReleases(store, emptyPlan("Europe/Berlin"), { id: "p1", series: "", shorts: 3 }, now);
  expect(scheduleOf(store, "p1")).toBeUndefined();
});

it("reads Studio's clear checks as ok, and keeps any other words", async () => {
  const { checksWord } = await import("./videos.js");
  expect(
    checksWord("— No noticesThis video is reaching viewers and earning according to your settings"),
  ).toBe("ok");
  expect(checksWord("None")).toBe("ok");
  expect(checksWord("Copyright claim")).toBe("Copyright claim");
});

it("swaps two videos' release times, and their shorts follow each", () => {
  const store = db();
  setRelease(store, "p1", 0, "2026-10-04T18:00:00.000Z", "1", now);
  planReleases(store, plan, { id: "p1", series: "", shorts: 1 }, now);
  setRelease(store, "p2", 0, "2026-10-08T18:00:00.000Z", "3", now);
  planReleases(store, plan, { id: "p2", series: "", shorts: 1 }, now);
  expect(swapReleases(store, "p1", "p2", now)).toBe(true);
  planReleases(store, plan, { id: "p1", series: "", shorts: 1 }, now);
  planReleases(store, plan, { id: "p2", series: "", shorts: 1 }, now);
  expect(scheduleOf(store, "p1")).toMatchObject({ row: "3", longAt: "2026-10-08T18:00:00.000Z" });
  expect(scheduleOf(store, "p2")).toMatchObject({ row: "1", longAt: "2026-10-04T18:00:00.000Z" });
  // Each short comes after its own video's new time.
  expect(Date.parse(scheduleOf(store, "p1")?.shortsAt[0] ?? "")).toBeGreaterThan(
    Date.parse("2026-10-08T18:00:00.000Z"),
  );
  expect(swapReleases(store, "p1", "p3", now)).toBe(false);
});

it("gives a schedule's project its run day's line, in the schedule's zone, and no other project", () => {
  const store = db();
  const lines: PostingPlan = {
    timeZone: "UTC",
    rows: [
      {
        name: "sun",
        series: "",
        long: at(0, "20:00"),
        shorts: [at(1, "12:00")],
        schedule: "s1",
        runDay: 5,
        timeZone: "Europe/Berlin",
      },
      {
        name: "tue",
        series: "",
        long: at(2, "20:00"),
        shorts: [],
        schedule: "s1",
        runDay: 0,
        timeZone: "Europe/Berlin",
      },
    ],
  };
  // Made by Sunday's run: it skips the earlier Sunday line for Tuesday's.
  planReleases(store, lines, { id: "p1", series: "", schedule: "s1", runDay: 0, shorts: 0 }, now);
  expect(scheduleOf(store, "p1")).toMatchObject({ row: "tue", longAt: "2026-10-06T18:00:00.000Z" });
  // Friday's run: Sunday 20:00 Berlin, its short Monday noon Berlin.
  planReleases(store, lines, { id: "p2", series: "", schedule: "s1", runDay: 5, shorts: 1 }, now);
  expect(scheduleOf(store, "p2")).toMatchObject({
    row: "sun",
    longAt: "2026-10-04T18:00:00.000Z",
    shortsAt: ["2026-10-05T10:00:00.000Z"],
  });
  // A project from no schedule takes none of a schedule's lines, unless it is of the
  // schedule's template's series.
  planReleases(store, lines, { id: "p3", series: "Other", shorts: 0 }, now);
  expect(scheduleOf(store, "p3")).toBeUndefined();
  const series = { ...lines, rows: lines.rows.map((row) => ({ ...row, series: "Tales" })) };
  planReleases(store, series, { id: "p3", series: "Tales", shorts: 0 }, now);
  expect(scheduleOf(store, "p3")?.longAt).toBe("2026-10-11T18:00:00.000Z");
});

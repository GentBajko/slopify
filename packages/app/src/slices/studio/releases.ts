import type { DatabaseSync } from "node:sqlite";
import { readSetting, writeSetting } from "../settings/repo.js";
import { zonedTimes } from "./plan.js";
import { leadHoursDefault, leadHoursMax, type PostingPlan } from "./plan-model.js";

// The release calendar: one release time for each long video (short 0) and each short, kept
// per project in `releases`. A finished project takes the posting plan's next free long-video
// time of its series when its upload is prepared, and its shorts take the line's short times
// that come round after it, never in the same hour as another release. The person can move
// any of them; moving a long video re-plans only the shorts the plan placed.

export interface Release {
  readonly short: number;
  // ISO; "" is "not scheduled".
  readonly at: string;
  readonly line: string | null;
  readonly by: "plan" | "person";
}

export interface Slot {
  // The posting-plan line the time comes from.
  readonly row: string;
  // The long video's release, ISO.
  readonly longAt: string;
}

export interface Schedule extends Slot {
  // Each short's release, in order, ISO; null for a short with no time yet.
  readonly shortsAt: readonly (string | null)[];
}

const hourMs = 60 * 60 * 1000;
export const leadHoursKey = "studio.leadHours";
const leadKey = leadHoursKey;

export function readLeadHours(db: DatabaseSync): number {
  const stored = Number(readSetting(db, leadKey));
  return Number.isInteger(stored) && stored >= 1 && stored <= leadHoursMax
    ? stored
    : leadHoursDefault;
}

export function writeLeadHours(db: DatabaseSync, hours: number): void {
  writeSetting(db, leadKey, String(hours));
}

export function releasesOf(db: DatabaseSync, projectId: string): readonly Release[] {
  return db
    .prepare("SELECT short, release_at, line, by FROM releases WHERE project_id=? ORDER BY short")
    .all(projectId)
    .map((row) => ({
      short: Number(row.short),
      at: String(row.release_at),
      line: row.line === null ? null : String(row.line),
      by: row.by === "person" ? ("person" as const) : ("plan" as const),
    }));
}

export function allReleases(
  db: DatabaseSync,
): readonly (Release & { readonly projectId: string })[] {
  return db
    .prepare(
      "SELECT project_id, short, release_at, line, by FROM releases WHERE release_at != '' ORDER BY release_at",
    )
    .all()
    .map((row) => ({
      projectId: String(row.project_id),
      short: Number(row.short),
      at: String(row.release_at),
      line: row.line === null ? null : String(row.line),
      by: row.by === "person" ? ("person" as const) : ("plan" as const),
    }));
}

function write(db: DatabaseSync, projectId: string, release: Release, now: Date): void {
  db.prepare(
    `INSERT INTO releases(project_id,short,release_at,line,by,set_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(project_id,short) DO UPDATE SET release_at=excluded.release_at,
       line=excluded.line, by=excluded.by, set_at=excluded.set_at`,
  ).run(projectId, release.short, release.at, release.line, release.by, now.toISOString());
}

// The hours other releases already take: two never go out in the same hour.
function takenHours(db: DatabaseSync, exceptProject?: string): Set<number> {
  return new Set(
    allReleases(db)
      .filter((release) => release.projectId !== exceptProject)
      .map((release) => Math.floor(Date.parse(release.at) / hourMs)),
  );
}

const fits = (line: PostingPlan["rows"][number], series: string): boolean =>
  line.series === "" || line.series === series;

// The plan's long-video times from `from` to `until`, in order, each with its line.
export function lineSlots(
  plan: PostingPlan,
  from: Date,
  until: Date,
): readonly (Slot & { readonly series: string })[] {
  return plan.rows
    .flatMap((line) =>
      zonedTimes(plan.timeZone, line.long, from, until).map((at) => ({
        row: line.name,
        series: line.series,
        longAt: at.toISOString(),
      })),
    )
    .toSorted((left, right) => Date.parse(left.longAt) - Date.parse(right.longAt));
}

// The coming long-video times a project of `series` may take: far enough ahead to upload in
// time, of a line that takes its series, in an hour no other release has.
export function freeSlots(
  db: DatabaseSync,
  plan: PostingPlan,
  series: string,
  now: Date,
  count: number,
  exceptProject?: string,
): readonly Slot[] {
  const taken = takenHours(db, exceptProject);
  const from = new Date(now.getTime() + readLeadHours(db) * hourMs);
  return lineSlots(plan, from, new Date(from.getTime() + 8 * 7 * 24 * hourMs))
    .filter((slot) => {
      const line = plan.rows.find((one) => one.name === slot.row);
      return (
        line !== undefined &&
        fits(line, series) &&
        !taken.has(Math.floor(Date.parse(slot.longAt) / hourMs))
      );
    })
    .slice(0, count)
    .map(({ row, longAt }) => ({ row, longAt }));
}

// Gives a finished project its release times where it has none: the long video the next free
// slot of its series, each short the line's first short time after the one before it in an
// hour no other release has. A project set to "not scheduled" is left so.
export function planReleases(
  db: DatabaseSync,
  plan: PostingPlan,
  project: { readonly id: string; readonly series: string; readonly shorts: number },
  now: Date,
): void {
  let releases = releasesOf(db, project.id);
  let long = releases.find((release) => release.short === 0);
  if (long === undefined) {
    const slot = freeSlots(db, plan, project.series, now, 1, project.id)[0];
    if (slot === undefined) return;
    long = { short: 0, at: slot.longAt, line: slot.row, by: "plan" };
    write(db, project.id, long, now);
    releases = releasesOf(db, project.id);
  }
  if (long.at === "") return;
  const line = plan.rows.find((one) => one.name === long?.line);
  if (line === undefined || line.shorts.length === 0) return;
  const taken = takenHours(db, project.id);
  for (const release of releases)
    if (release.at !== "") taken.add(Math.floor(Date.parse(release.at) / hourMs));
  const longAt = new Date(long.at);
  const times = line.shorts
    .flatMap((slot) =>
      zonedTimes(plan.timeZone, slot, longAt, new Date(longAt.getTime() + 5 * 7 * 24 * hourMs)),
    )
    .toSorted((left, right) => left.getTime() - right.getTime());
  let after = longAt.getTime();
  for (let short = 1; short <= project.shorts; short += 1) {
    const kept = releases.find((release) => release.short === short);
    if (kept !== undefined) {
      if (kept.at !== "") after = Math.max(after, Date.parse(kept.at));
      continue;
    }
    const at = times.find(
      (time) => time.getTime() > after && !taken.has(Math.floor(time.getTime() / hourMs)),
    );
    if (at === undefined) return;
    taken.add(Math.floor(at.getTime() / hourMs));
    after = at.getTime();
    write(db, project.id, { short, at: at.toISOString(), line: line.name, by: "plan" }, now);
  }
}

// The person sets one release: an ISO time, or "" for "not scheduled". Moving the long video
// drops the shorts' plan-placed times, so they are planned again after it.
export function setRelease(
  db: DatabaseSync,
  projectId: string,
  short: number,
  at: string,
  line: string | null,
  now: Date,
): void {
  write(db, projectId, { short, at, line, by: "person" }, now);
  if (short === 0)
    db.prepare("DELETE FROM releases WHERE project_id=? AND short>0 AND by='plan'").run(projectId);
}

// Two projects trade their long videos' release times (and lines); each one's plan-placed
// shorts are dropped, to be placed again after its new time. False when either has no time.
export function swapReleases(db: DatabaseSync, first: string, second: string, now: Date): boolean {
  const longOf = (projectId: string) =>
    releasesOf(db, projectId).find((release) => release.short === 0 && release.at !== "");
  const a = longOf(first);
  const b = longOf(second);
  if (a === undefined || b === undefined || first === second) return false;
  setRelease(db, first, 0, b.at, b.line, now);
  setRelease(db, second, 0, a.at, a.line, now);
  return true;
}

export function scheduleOf(db: DatabaseSync, projectId: string): Schedule | undefined {
  const releases = releasesOf(db, projectId);
  const long = releases.find((release) => release.short === 0);
  if (long === undefined || long.at === "") return undefined;
  const last = Math.max(0, ...releases.map((release) => release.short));
  return {
    row: long.line ?? "",
    longAt: long.at,
    shortsAt: Array.from({ length: last }, (_, index) => {
      const at = releases.find((release) => release.short === index + 1)?.at;
      return at === undefined || at === "" ? null : at;
    }),
  };
}

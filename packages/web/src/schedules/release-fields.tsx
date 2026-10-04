import type { ScheduleRelease } from "@app/slices/schedules/schema.js";
import { weekdays } from "@app/slices/studio/plan-model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";

// The schedule's release times: for each day it runs, when the project that run makes goes out
// on YouTube, the long video and each of the template's shorts, a weekday and a time in the
// schedule's time zone. Each goes out the first time its day and hour come round after the one
// before it. The release calendar, Prepare upload and the Studio extension read them.

type Time = ScheduleRelease["long"];

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Monday first, as the weekday boxes above.
const weekOrder = [1, 2, 3, 4, 5, 6, 0];

// A new line: the long video that evening, the shorts over the days after it, noon and 5 PM.
function shortDefault(day: number, index: number): Time {
  return {
    day: (day + 1 + Math.floor(index / 2)) % 7,
    time: index % 2 === 0 ? "12:00" : "17:00",
  };
}

export function releaseDefault(day: number, shorts: number): ScheduleRelease {
  return {
    day,
    long: { day, time: "20:00" },
    shorts: Array.from({ length: shorts }, (_, index) => shortDefault(day, index)),
  };
}

// One line for each run day, with as many short times as the template makes shorts.
export function releaseLines(
  saved: readonly ScheduleRelease[],
  runDays: readonly number[],
  shorts: number,
): readonly ScheduleRelease[] {
  return weekOrder
    .filter((day) => runDays.includes(day))
    .map((day) => {
      const line = saved.find((one) => one.day === day) ?? releaseDefault(day, shorts);
      return {
        ...line,
        shorts: Array.from(
          { length: shorts },
          (_, index) => line.shorts[index] ?? shortDefault(day, index),
        ),
      };
    });
}

function TimeCell({
  value,
  label,
  onChange,
}: {
  readonly value: Time;
  readonly label: string;
  readonly onChange: (next: Time) => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-1">
      <span className="w-[64px] shrink-0 text-small text-ink-3">{label}</span>
      <Select
        aria-label={`${label}: day`}
        className="w-[84px]"
        value={String(value.day)}
        onChange={(event) => onChange({ ...value, day: Number(event.currentTarget.value) })}
        options={weekdays.map((name, day) => ({ value: String(day), label: name }))}
      />
      <Input
        aria-label={`${label}: time`}
        type="time"
        className="w-[124px]"
        value={value.time}
        onChange={(event) => onChange({ ...value, time: event.currentTarget.value || value.time })}
      />
    </div>
  );
}

export function ReleaseFields({
  releases,
  onReleases,
  runDays,
  shorts,
  once,
  timezone,
}: {
  // Null: the schedule sets no release times.
  readonly releases: readonly ScheduleRelease[] | null;
  readonly onReleases: (next: readonly ScheduleRelease[] | null) => void;
  readonly runDays: readonly number[];
  // How many shorts the template makes.
  readonly shorts: number;
  readonly once: boolean;
  readonly timezone: string;
}): ReactElement {
  const lines = releases === null ? [] : releaseLines(releases, runDays, shorts);
  const change = (day: number, next: ScheduleRelease) =>
    onReleases(lines.map((line) => (line.day === day ? next : line)));
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-3 border-0 border-t border-line p-0 pt-5 min-[700px]:col-span-2"
      {...helpScope}
    >
      <legend className="float-left mb-1 w-full text-title-3 font-semibold">Release times</legend>
      <p className="m-0 text-small text-ink-2">
        {once
          ? "A one-time schedule has no release times: set the project's in its Video section once it is done."
          : `When each run's project goes out on YouTube, in ${timezone}. Each short goes out the first time its day and hour come round after the one before it. Calendar → Releases shows them, and the Studio extension types them into Studio.`}
      </p>
      {once ? null : releases === null ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => onReleases(releaseLines([], runDays, shorts))}
            disabled={runDays.length === 0}
          >
            Set release times
          </Button>
        </div>
      ) : (
        <>
          {lines.map((line) => (
            <div
              key={line.day}
              className="flex flex-col gap-2 border-b border-line pb-3 last:border-b-0"
            >
              <div className="text-small font-semibold">{dayNames[line.day]}'s run</div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <TimeCell
                  label="Video"
                  value={line.long}
                  onChange={(long) => change(line.day, { ...line, long })}
                />
                {line.shorts.map((short, index) => (
                  <TimeCell
                    // biome-ignore lint/suspicious/noArrayIndexKey: a short's place is its identity
                    key={index}
                    label={`Short ${String(index + 1)}`}
                    value={short}
                    onChange={(next) =>
                      change(line.day, {
                        ...line,
                        shorts: line.shorts.map((one, at) => (at === index ? next : one)),
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          {shorts === 0 ? (
            <p className="m-0 text-small text-ink-3">
              The template makes no shorts, so only the long video has a time.
            </p>
          ) : null}
          <div>
            <Button variant="quiet" onClick={() => onReleases(null)}>
              Set no release times
            </Button>
          </div>
        </>
      )}
    </fieldset>
  );
}

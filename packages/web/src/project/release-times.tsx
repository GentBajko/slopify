import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useId, useState } from "react";
import { readProjectReleases, readReleaseCalendar, saveRelease, swapRelease } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { HelpLine, Input, Select } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope } from "@/components/kit/info-tip";
import { TextLink } from "@/components/kit/link";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { fromZonedInput, zoneDiffers, zonedFormat, zonedInput, zoneName } from "@/lib/zoned";
import { keys } from "@/queries";

// The YouTube section's Release block: the day the long video and each short go public on
// YouTube, kept by Slopify and typed by the person into Studio's Visibility step (or by the
// Studio extension), with the time each must be uploaded by. The same dates Calendar →
// Releases, Copy for YouTube Studio and the extension read. A date saves when its box is left
// or Enter is pressed, with Undo on the notice.

// The query the Release block reads; Copy for YouTube Studio's Release picker refreshes it.
export const projectReleasesKey = (projectId: string) =>
  ["studio", "project-releases", projectId] as const;

// Every time here is read in the zone its schedule (or the posting plan) keeps, as Calendar →
// Releases reads it, with the zone named beside a time when it isn't the browser's.
const whenOptions: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

// "Video", "Short 1": one name for each upload, here, under YouTube links and in Copy for
// YouTube Studio.
export function uploadName(short: number | null): string {
  return short === null || short === 0 ? "Video" : `Short ${String(short)}`;
}

interface Change {
  readonly short: number;
  readonly at: string | null;
  readonly line?: string;
  // What it was, for Undo; absent on the Undo itself.
  readonly before?: string | null;
}

export function ReleaseTimes({ projectId }: { readonly projectId: string }): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const id = useId();
  const key = projectReleasesKey(projectId);
  const read = useQuery({ queryKey: key, queryFn: () => readProjectReleases(api, projectId) });
  const [drafts, setDrafts] = useState<Readonly<Record<number, string>>>({});
  // The other videos with a date, for Swap with….
  const calendar = useQuery({
    queryKey: [...keys.studioReleases, "swap", 8],
    queryFn: () => readReleaseCalendar(api, 8),
  });
  const others = (calendar.data?.entries ?? []).flatMap((entry) =>
    entry.project === null || entry.project.id === projectId
      ? []
      : [{ id: entry.project.id, title: entry.project.title, at: entry.at }],
  );
  const [freePick, setFreePick] = useState("");
  const [swapPick, setSwapPick] = useState("");
  const zone = read.data?.timeZone;
  const when = (iso: string): string => {
    const text = zonedFormat(iso, zone, whenOptions);
    return zone !== undefined && zoneDiffers(iso, zone) ? `${text} ${zoneName(zone)}` : text;
  };
  const refresh = (...more: readonly string[]) => {
    void client.invalidateQueries({ queryKey: key });
    void client.invalidateQueries({ queryKey: keys.studioReleases });
    void client.invalidateQueries({ queryKey: ["studio", "pack", projectId] });
    for (const other of more)
      void client.invalidateQueries({ queryKey: projectReleasesKey(other) });
  };
  // Swapping back with the same video is the undo: the two dates trade places again.
  const swap = useMutation({
    mutationFn: ({ other }: { readonly other: string; readonly undo: boolean }) =>
      swapRelease(api, projectId, other),
    onSuccess: (_, { other, undo }) => {
      refresh(other);
      setSwapPick("");
      const title = others.find((one) => one.id === other)?.title ?? "the other video";
      if (undo) notify(`Swapped back: the dates with ${title} are as they were.`, "success");
      else
        notify(`Swapped release dates with ${title}; each one's shorts moved with it.`, "success", {
          label: "Undo",
          run: () => swap.mutate({ other, undo: true }),
        });
    },
    onError: (error: Error) =>
      notify(
        `The dates weren't swapped: ${error.message} Pick the video under Swap with and press Swap again.`,
        "error",
      ),
  });
  const save = useMutation({
    mutationFn: (change: Change) =>
      saveRelease(api, projectId, {
        short: change.short,
        at: change.at,
        ...(change.line === undefined ? {} : { line: change.line }),
      }),
    onSuccess: (_, change) => {
      refresh();
      setDrafts((all) => {
        const { [change.short]: _gone, ...rest } = all;
        return rest;
      });
      if (change.line !== undefined) setFreePick("");
      // "the video", "Short 1".
      const name = change.short === 0 ? "the video" : uploadName(change.short);
      const said =
        change.at === null
          ? `Cleared the release date of ${name}.`
          : `Saved: ${name} goes public ${when(change.at)}.`;
      const before = change.before;
      notify(
        said,
        "success",
        before === undefined
          ? undefined
          : { label: "Undo", run: () => save.mutate({ short: change.short, at: before }) },
      );
    },
    onError: (error: Error) => notify(`The date wasn't saved: ${error.message}`, "error"),
  });
  if (read.data === undefined || read.data.items.length === 0) return null;
  const { items, free, leadHours } = read.data;
  const long = items.find((item) => item.short === 0);
  // A box saves its date when it is left: a whole date that changed is saved; one half typed
  // (the browser reports it as empty) goes back to what was saved. Clear the date empties it.
  const commit = (item: (typeof items)[number]) => {
    const draft = drafts[item.short];
    if (draft === undefined) return;
    const was = item.at === null ? "" : zonedInput(item.at, zone);
    if (draft === "" || draft === was) {
      setDrafts((all) => {
        const { [item.short]: _gone, ...rest } = all;
        return rest;
      });
      return;
    }
    save.mutate({ short: item.short, at: fromZonedInput(draft, zone), before: item.at });
  };
  const swappable = long !== undefined && long.at !== null && others.length > 0;
  const planShown = free.length > 0 || swappable;
  return (
    <section aria-labelledby={`${id}-head`} className="flex min-w-0 flex-col gap-2" {...helpScope}>
      <h3 id={`${id}-head`} className="m-0 border-b border-line pb-1.5 text-title-3 font-semibold">
        Release
      </h3>
      <HelpLine>
        {`The day each one goes public on YouTube. Slopify keeps the date; you set it in YouTube Studio's Visibility step. Upload at least ${String(leadHours)} hours before.`}
      </HelpLine>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item) => {
          const name = uploadName(item.short);
          const draft = drafts[item.short] ?? (item.at === null ? "" : zonedInput(item.at, zone));
          const late =
            !item.onYoutube && item.uploadBy !== null && Date.parse(item.uploadBy) < Date.now();
          const state: ReactNode = item.onYoutube ? (
            <>
              <Status tone="done">Uploaded</Status>
              {item.at === null ? null : ` · goes public ${when(item.at)}`}
            </>
          ) : item.at === null || item.uploadBy === null ? (
            "No date yet"
          ) : late ? (
            <>
              <Status tone="failed">Late</Status>
              {` · goes public ${when(item.at)}; it was due on YouTube by ${when(item.uploadBy)}. Upload it now, or pick a later date.`}
            </>
          ) : (
            `Goes public ${when(item.at)} · upload by ${when(item.uploadBy)}`
          );
          return (
            <li key={item.short} className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label
                  htmlFor={`${id}-${String(item.short)}`}
                  className="w-16 shrink-0 text-small font-semibold"
                >
                  {name}
                </label>
                <Input
                  id={`${id}-${String(item.short)}`}
                  aria-label={`${name} release date`}
                  aria-describedby={`${id}-${String(item.short)}-state`}
                  type="datetime-local"
                  className="w-[210px]"
                  value={draft}
                  disabled={save.isPending && save.variables?.short === item.short}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDrafts((all) => ({ ...all, [item.short]: value }));
                  }}
                  onBlur={() => commit(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commit(item);
                  }}
                />
                {zone !== undefined && item.at !== null && zoneDiffers(item.at, zone) ? (
                  <span className="text-small text-ink-2">{`${zoneName(zone)} time`}</span>
                ) : null}
                {item.at === null ? null : (
                  <Button
                    type="button"
                    size="small"
                    variant="quiet"
                    disabled={save.isPending}
                    onClick={() => save.mutate({ short: item.short, at: null, before: item.at })}
                  >
                    Clear the date
                  </Button>
                )}
              </div>
              <p
                id={`${id}-${String(item.short)}-state`}
                className={`m-0 pl-19 text-small ${late ? "text-danger" : "text-ink-2"} max-sm:pl-0`}
              >
                {state}
              </p>
            </li>
          );
        })}
      </ul>
      {planShown ? (
        <Fold
          summary="Posting plan"
          state={
            free.length > 0
              ? `${String(free.length)} free ${free.length === 1 ? "time" : "times"}`
              : undefined
          }
        >
          <div className="flex flex-col gap-2 pt-1">
            {free.length > 0 ? (
              <span className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Free time in the posting plan"
                  className="w-[230px]"
                  value={freePick}
                  onChange={(event) => setFreePick(event.currentTarget.value)}
                  options={[
                    { value: "", label: "Pick a free time…" },
                    ...free.map((slot) => ({ value: slot.longAt, label: when(slot.longAt) })),
                  ]}
                />
                <Button
                  type="button"
                  size="small"
                  disabled={freePick === "" || save.isPending}
                  disabledReason="Pick a free time first"
                  onClick={() => {
                    const slot = free.find((one) => one.longAt === freePick);
                    if (slot !== undefined)
                      save.mutate({
                        short: 0,
                        at: slot.longAt,
                        line: slot.row,
                        before: long?.at ?? null,
                      });
                  }}
                >
                  Take this time
                </Button>
              </span>
            ) : null}
            {swappable ? (
              <span className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Swap release dates with another video"
                  className="w-[260px]"
                  value={swapPick}
                  disabled={swap.isPending}
                  onChange={(event) => setSwapPick(event.currentTarget.value)}
                  options={[
                    { value: "", label: "Swap with…" },
                    ...others.map((one) => ({
                      value: one.id,
                      label: `${one.title.split(" | ")[0] ?? one.title} · ${when(one.at)}`,
                    })),
                  ]}
                />
                <Button
                  type="button"
                  size="small"
                  disabled={swapPick === "" || swap.isPending}
                  disabledReason="Pick a video to swap with first"
                  onClick={() => swap.mutate({ other: swapPick, undo: false })}
                >
                  Swap
                </Button>
              </span>
            ) : null}
            <HelpLine>
              The free times of your posting plan for this series, and swapping dates with another
              video: its shorts move with it.
            </HelpLine>
          </div>
        </Fold>
      ) : null}
      <p className="sl-help m-0">
        Pick a date above, or see every video's dates in{" "}
        <TextLink to="/calendar" search={{ tab: "releases" }}>
          Calendar → Releases
        </TextLink>
        .
      </p>
    </section>
  );
}

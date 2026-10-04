import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { readProjectReleases, readReleaseCalendar, saveRelease, swapRelease } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { Badge } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";

// The project page's Release block (Video section): when the long video and each short go
// out, editable here, with the time each must be uploaded and scheduled by. The same times
// Calendar → Releases, Prepare upload and the Studio extension use.

const when = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// "2026-10-04T20:00" in this browser's zone, for a datetime-local input.
function localInput(iso: string): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function ReleaseTimes({ projectId }: { readonly projectId: string }): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const key = ["studio", "project-releases", projectId] as const;
  const read = useQuery({ queryKey: key, queryFn: () => readProjectReleases(api, projectId) });
  const [drafts, setDrafts] = useState<Readonly<Record<number, string>>>({});
  // The other scheduled videos, for Swap with….
  const calendar = useQuery({
    queryKey: ["studio", "releases", "swap", 8],
    queryFn: () => readReleaseCalendar(api, 8),
  });
  const others = (calendar.data?.entries ?? []).flatMap((entry) =>
    entry.project === null || entry.project.id === projectId
      ? []
      : [{ id: entry.project.id, title: entry.project.title, at: entry.at }],
  );
  const swap = useMutation({
    mutationFn: (other: string) => swapRelease(api, projectId, other),
    onSuccess: (_, other) => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ["studio", "releases"] });
      void client.invalidateQueries({ queryKey: ["studio", "project-releases", other] });
      notify(
        `Swapped release times with ${others.find((one) => one.id === other)?.title ?? "the other video"}; each one's shorts moved with it.`,
        "success",
      );
    },
    onError: (error: Error) => notify(`The times weren't swapped: ${error.message}`, "error"),
  });
  const save = useMutation({
    mutationFn: (change: { short: number; at: string | null; line?: string }) =>
      saveRelease(api, projectId, change),
    onSuccess: (_, change) => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ["studio", "releases"] });
      setDrafts((all) => {
        const { [change.short]: _gone, ...rest } = all;
        return rest;
      });
      notify(
        change.at === null
          ? "Not scheduled: set its time in Studio yourself, or pick one here."
          : "Saved the release time.",
        "success",
      );
    },
    onError: (error: Error) => notify(`The time wasn't saved: ${error.message}`, "error"),
  });
  if (read.data === undefined) return null;
  const { items, free, leadHours } = read.data;
  if (items.length === 0) return null;
  return (
    <section aria-label="Release" className="flex flex-col gap-3">
      <SectionHead
        as="h3"
        size="small"
        title="Release"
        meta={`Upload and schedule each one at least ${String(leadHours)} hours before it goes out.`}
      />
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item) => {
          const label = item.short === 0 ? "Long video" : `Short ${String(item.short)}`;
          const draft = drafts[item.short] ?? (item.at === null ? "" : localInput(item.at));
          const changed = draft !== (item.at === null ? "" : localInput(item.at));
          const late =
            !item.onYoutube && item.uploadBy !== null && Date.parse(item.uploadBy) < Date.now();
          return (
            <li key={item.short} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-[86px] shrink-0 text-small font-semibold">{label}</span>
              <Input
                aria-label={`${label}: release`}
                type="datetime-local"
                className="w-[210px]"
                value={draft}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDrafts((all) => ({ ...all, [item.short]: value }));
                }}
              />
              {changed ? (
                <Button
                  type="button"
                  size="small"
                  disabled={draft === "" || save.isPending}
                  onClick={() =>
                    save.mutate({ short: item.short, at: new Date(draft).toISOString() })
                  }
                >
                  Save
                </Button>
              ) : null}
              {item.short === 0 && free.length > 0 ? (
                <Select
                  aria-label="Take a free time of the posting plan"
                  className="w-[230px]"
                  value=""
                  onChange={(event) => {
                    const slot = free.find((one) => one.longAt === event.currentTarget.value);
                    if (slot !== undefined)
                      save.mutate({ short: 0, at: slot.longAt, line: slot.row });
                  }}
                  options={[
                    { value: "", label: "Free plan times…" },
                    ...free.map((slot) => ({
                      value: slot.longAt,
                      label: when.format(new Date(slot.longAt)),
                    })),
                  ]}
                />
              ) : null}
              {item.at !== null && item.short === 0 && others.length > 0 ? (
                <Select
                  aria-label="Swap release times with another video"
                  className="w-[260px]"
                  value=""
                  disabled={swap.isPending}
                  onChange={(event) => {
                    if (event.currentTarget.value !== "") swap.mutate(event.currentTarget.value);
                  }}
                  options={[
                    { value: "", label: "Swap with…" },
                    ...others.map((one) => ({
                      value: one.id,
                      label: `${one.title.split(" | ")[0] ?? one.title} · ${when.format(new Date(one.at))}`,
                    })),
                  ]}
                />
              ) : null}
              {item.at !== null && item.short === 0 ? (
                <Button
                  type="button"
                  size="small"
                  variant="quiet"
                  disabled={save.isPending}
                  onClick={() => save.mutate({ short: 0, at: null })}
                >
                  Not scheduled
                </Button>
              ) : null}
              <span className="text-small text-ink-3">
                {item.onYoutube ? (
                  <Badge>✓ on YouTube</Badge>
                ) : item.uploadBy === null ? (
                  "No time yet"
                ) : late ? (
                  <Badge tone="failed">Late · upload now</Badge>
                ) : (
                  `Ready · upload any time before ${when.format(new Date(item.uploadBy))}`
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-small text-ink-3">
        Every video's times are together in{" "}
        <Link to="/calendar" search={{ tab: "releases" }}>
          Calendar → Releases
        </Link>
        .
      </p>
    </section>
  );
}

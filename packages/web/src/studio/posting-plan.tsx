import type { PlanSlot, PostingPlan } from "@app/slices/studio/plan-model.js";
import { weekdays } from "@app/slices/studio/plan-model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { readPostingPlan, saveAutoComment, saveLeadHours, savePostingPlan } from "@/api";
import { useApp } from "@/app-context";
import { Button, IconButton } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";

// Settings → YouTube Studio → Posting plan: the week, one line per long video with its own
// shorts (as many as you post), each a day and a time. Empty until made. A finished project
// takes the next free long-video time when its upload is prepared; each short goes out the
// first time its day and hour come round after its own video, so nothing needs "next week".
// The extension types the times into Studio's schedule.

export const planKey = ["studio", "plan"] as const;

const zones = ["America/New_York", "America/Los_Angeles", "Europe/London", "UTC"];

function SlotCell({
  slot,
  label,
  onChange,
}: {
  readonly slot: PlanSlot;
  readonly label: string;
  readonly onChange: (next: PlanSlot) => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-1">
      <Select
        aria-label={`${label}: day`}
        className="w-[92px]"
        value={String(slot.day)}
        onChange={(event) => onChange({ ...slot, day: Number(event.currentTarget.value) })}
        options={weekdays.map((name, day) => ({ value: String(day), label: name }))}
      />
      <Input
        aria-label={`${label}: time`}
        type="time"
        className="w-[132px]"
        value={slot.time}
        onChange={(event) => onChange({ ...slot, time: event.currentTarget.value || slot.time })}
      />
    </div>
  );
}

export function PostingPlanSettings({
  autoComment,
}: {
  readonly autoComment: boolean | undefined;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const saved = useQuery({ queryKey: planKey, queryFn: () => readPostingPlan(api) });
  const [draft, setDraft] = useState<PostingPlan | undefined>();
  const plan = draft ?? saved.data?.plan;
  const save = useMutation({
    mutationFn: (next: PostingPlan) => savePostingPlan(api, next),
    onSuccess: (body) => {
      client.setQueryData(planKey, body);
      setDraft(undefined);
      notify("Saved the posting plan.", "success");
    },
    onError: (error: Error) => notify(`The posting plan wasn't saved: ${error.message}`, "error"),
  });
  const lead = useMutation({
    mutationFn: (hours: number) => saveLeadHours(api, hours),
    onSuccess: (body) => {
      client.setQueryData(planKey, body);
      void client.invalidateQueries({ queryKey: ["studio", "releases"] });
      notify(
        `Each upload is now due ${String(body.leadHours)} hours before its release.`,
        "success",
      );
    },
    onError: (error: Error) => notify(`The lead time wasn't saved: ${error.message}`, "error"),
  });
  const comment = useMutation({
    mutationFn: (on: boolean) => saveAutoComment(api, on),
    onSuccess: () => client.invalidateQueries({ queryKey: ["studio", "settings"] }),
    onError: (error: Error) => notify(`Not saved: ${error.message}`, "error"),
  });
  if (plan === undefined) return <p className="text-small text-ink-3">Loading the posting plan…</p>;
  const change = (next: PostingPlan) => setDraft(next);
  const setRow = (index: number, row: PostingPlan["rows"][number]) =>
    change({ ...plan, rows: plan.rows.map((one, at) => (at === index ? row : one)) });
  // Rows keep an inner name only so a project's slot can say which one it took; it is never shown.
  const freshName = (): string => {
    const taken = new Set(plan.rows.map((row) => row.name));
    for (let at = 1; ; at++) if (!taken.has(String(at))) return String(at);
  };
  const zoneChoices = [...new Set([plan.timeZone, ...zones])];
  return (
    <section aria-label="Posting plan" className="flex flex-col gap-3">
      <SectionHead as="h3" title="Posting plan" />
      <p className="m-0 text-small text-ink-2">
        One line per long video you post each week, with its series and its shorts. A finished
        project takes the next free time of a line that takes its series (from its titles, the part
        after "|"); each short goes out the first time its day and hour come round after its own
        video, never in the same hour as another release. See and move them in Calendar → Releases.
      </p>
      {plan.rows.length === 0 ? (
        <p className="m-0 text-small text-ink-3">
          No posting plan yet, so nothing is scheduled. Press Add a long video to start.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {plan.rows.map((row, index) => (
            <li key={row.name} className="flex flex-col gap-2 border-b border-line pb-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex items-center gap-2">
                  <span className="text-small font-semibold">{`Long video ${String(index + 1)}`}</span>
                  <SlotCell
                    slot={row.long}
                    label={`Long video ${String(index + 1)}`}
                    onChange={(long) => setRow(index, { ...row, long })}
                  />
                </span>
                <Select
                  aria-label={`Long video ${String(index + 1)}: series`}
                  className="w-[220px]"
                  value={row.series}
                  onChange={(event) => setRow(index, { ...row, series: event.currentTarget.value })}
                  options={[
                    { value: "", label: "Any series" },
                    ...[...new Set([...(saved.data?.series ?? []), row.series])]
                      .filter((one) => one !== "")
                      .map((one) => ({ value: one, label: one })),
                  ]}
                />
                <span className="flex-1" />
                <IconButton
                  label={`Remove long video ${String(index + 1)}`}
                  onClick={() =>
                    change({ ...plan, rows: plan.rows.filter((_, at) => at !== index) })
                  }
                >
                  <Trash2Icon aria-hidden="true" strokeWidth={1.75} />
                </IconButton>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-4">
                {row.shorts.length === 0 ? (
                  <span className="text-small text-ink-3">No shorts</span>
                ) : null}
                {row.shorts
                  .map((short, at) => ({ short, at, key: `${row.name}-${String(at + 1)}` }))
                  .map(({ short, at, key }) => (
                    <span key={key} className="flex items-center gap-1">
                      <span className="text-small text-ink-3">{`Short ${String(at + 1)}`}</span>
                      <SlotCell
                        slot={short}
                        label={`Long video ${String(index + 1)}, short ${String(at + 1)}`}
                        onChange={(next) =>
                          setRow(index, {
                            ...row,
                            shorts: row.shorts.map((one, here) => (here === at ? next : one)),
                          })
                        }
                      />
                      <IconButton
                        label={`Remove short ${String(at + 1)} of long video ${String(index + 1)}`}
                        onClick={() =>
                          setRow(index, {
                            ...row,
                            shorts: row.shorts.filter((_, here) => here !== at),
                          })
                        }
                      >
                        <XIcon aria-hidden="true" strokeWidth={1.75} />
                      </IconButton>
                    </span>
                  ))}
                <Button
                  type="button"
                  variant="quiet"
                  disabled={row.shorts.length >= 10}
                  onClick={() =>
                    setRow(index, {
                      ...row,
                      shorts: [...row.shorts, row.shorts.at(-1) ?? { ...row.long }],
                    })
                  }
                >
                  <PlusIcon aria-hidden="true" strokeWidth={1.75} />
                  Short
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="quiet"
          disabled={plan.rows.length >= 14}
          onClick={() =>
            change({
              ...plan,
              rows: [
                ...plan.rows,
                {
                  name: freshName(),
                  series: plan.rows.at(-1)?.series ?? "",
                  long: plan.rows.at(-1)?.long ?? { day: 0, time: "20:00" },
                  shorts: [],
                },
              ],
            })
          }
        >
          <PlusIcon aria-hidden="true" strokeWidth={1.75} />
          Add a long video
        </Button>
        <div className="flex items-center gap-2 text-small text-ink-2">
          Times are in
          <Select
            aria-label="The plan's time zone"
            value={plan.timeZone}
            onChange={(event) => change({ ...plan, timeZone: event.currentTarget.value })}
            options={zoneChoices.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))}
          />
        </div>
        <span className="flex-1" />
        <Button
          type="button"
          disabled={draft === undefined || save.isPending}
          onClick={() => save.mutate(plan)}
        >
          Save posting plan
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-small text-ink-2">
        Upload and schedule each video and short at least
        <Input
          aria-label="Hours before release"
          type="number"
          min={1}
          max={168}
          className="w-[72px]"
          defaultValue={saved.data?.leadHours ?? 24}
          key={saved.data?.leadHours ?? 24}
          onBlur={(event) => {
            const hours = Number(event.currentTarget.value);
            if (
              Number.isInteger(hours) &&
              hours >= 1 &&
              hours <= 168 &&
              hours !== saved.data?.leadHours
            )
              lead.mutate(hours);
          }}
        />
        hours before its release, so YouTube's copyright and ad checks finish while it is private.
      </div>
      <Switch
        checked={autoComment === true}
        disabled={comment.isPending || autoComment === undefined}
        onChange={(on) => comment.mutate(on)}
        label="Post and pin each video's comment once it is public (the extension posts it in your name)"
      />
    </section>
  );
}

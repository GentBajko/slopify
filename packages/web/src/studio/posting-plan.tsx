import type { PlanSlot, PostingPlan } from "@app/slices/studio/plan.js";
import { weekdays } from "@app/slices/studio/plan.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { readPostingPlan, saveAutoComment, savePostingPlan } from "@/api";
import { useApp } from "@/app-context";
import { Button, IconButton } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";

// Settings → YouTube Studio → Posting plan: the week as a table, one row per long video and its
// shorts, each cell a day and a time. A finished project takes the next free row when its
// upload is prepared; each short goes out the first time its day and hour come round after its
// own video, so nothing needs "next week". The extension types the times into Studio's schedule.

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
        className="w-[72px]"
        value={String(slot.day)}
        onChange={(event) => onChange({ ...slot, day: Number(event.currentTarget.value) })}
        options={weekdays.map((name, day) => ({ value: String(day), label: name }))}
      />
      <Input
        aria-label={`${label}: time`}
        type="time"
        className="w-[96px]"
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
  const comment = useMutation({
    mutationFn: (on: boolean) => saveAutoComment(api, on),
    onSuccess: () => client.invalidateQueries({ queryKey: ["studio", "settings"] }),
    onError: (error: Error) => notify(`Not saved: ${error.message}`, "error"),
  });
  if (plan === undefined) return <p className="text-small text-ink-3">Loading the posting plan…</p>;
  const shorts = Math.max(0, ...plan.rows.map((row) => row.shorts.length));
  const change = (next: PostingPlan) => setDraft(next);
  const setRow = (index: number, row: PostingPlan["rows"][number]) =>
    change({ ...plan, rows: plan.rows.map((one, at) => (at === index ? row : one)) });
  const zoneChoices = [...new Set([plan.timeZone, ...zones])];
  return (
    <section aria-label="Posting plan" className="flex flex-col gap-3">
      <SectionHead as="h3" title="Posting plan" />
      <p className="m-0 text-small text-ink-2">
        Each finished project takes the next free row when you prepare its upload. Each short goes
        out the first time its day and hour come round after its own video. The extension types the
        times into Studio; you press Schedule.
      </p>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-x-2 border-spacing-y-1 text-small">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="font-normal">Video</th>
              <th className="font-normal">Long video</th>
              {Array.from({ length: shorts }, (_, index) => `Short ${String(index + 1)}`).map(
                (name) => (
                  <th key={name} className="font-normal">
                    {name}
                  </th>
                ),
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row, index) => (
              <tr key={row.name}>
                <td className="font-semibold">{row.name}</td>
                <td>
                  <SlotCell
                    slot={row.long}
                    label={`${row.name}, long video`}
                    onChange={(long) => setRow(index, { ...row, long })}
                  />
                </td>
                {row.shorts
                  .map((short, at) => ({ short, at, key: `${row.name}-${String(at + 1)}` }))
                  .map(({ short, at, key }) => (
                    <td key={key}>
                      <SlotCell
                        slot={short}
                        label={`${row.name}, short ${String(at + 1)}`}
                        onChange={(next) =>
                          setRow(index, {
                            ...row,
                            shorts: row.shorts.map((one, here) => (here === at ? next : one)),
                          })
                        }
                      />
                    </td>
                  ))}
                <td>
                  <IconButton
                    label={`Remove row ${row.name}`}
                    onClick={() =>
                      change({ ...plan, rows: plan.rows.filter((_, at) => at !== index) })
                    }
                  >
                    <Trash2Icon aria-hidden="true" strokeWidth={1.75} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="quiet"
          disabled={plan.rows.length >= 14}
          onClick={() => {
            const last = plan.rows.at(-1);
            const name = String.fromCharCode(65 + plan.rows.length);
            change({
              ...plan,
              rows: [
                ...plan.rows,
                {
                  name,
                  long: last?.long ?? { day: 0, time: "20:00" },
                  shorts: last?.shorts ?? [],
                },
              ],
            });
          }}
        >
          <PlusIcon aria-hidden="true" strokeWidth={1.75} />
          Add a row
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
      <Switch
        checked={autoComment === true}
        disabled={comment.isPending || autoComment === undefined}
        onChange={(on) => comment.mutate(on)}
        label="Post and pin each video's comment once it is public (the extension posts it in your name)"
      />
    </section>
  );
}

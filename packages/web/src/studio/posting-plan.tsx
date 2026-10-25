import type { PostingPlan } from "@app/slices/studio/plan-model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import { readPostingPlan, saveAutoComment, saveLeadHours, savePostingPlan } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Input } from "@/components/kit/field";
import { TextLink } from "@/components/kit/link";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { keys } from "@/queries";
import { schedulesQuery } from "@/schedules/api";

// Settings → YouTube Studio → Release times: each schedule sets its own (Calendar → Schedules →
// Edit), so here are only what holds for every release: how long before its release each upload
// is due, and the pinned comment. A posting plan saved here before schedules had release times
// still applies until it is removed.

export const planKey = ["studio", "plan"] as const;

export function PostingPlanSettings({
  autoComment,
}: {
  readonly autoComment: boolean | undefined;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const saved = useQuery({ queryKey: planKey, queryFn: () => readPostingPlan(api) });
  const schedules = useQuery(schedulesQuery(api));
  const remove = useMutation({
    mutationFn: (current: PostingPlan) => savePostingPlan(api, { ...current, rows: [] }),
    onSuccess: (body) => {
      client.setQueryData(planKey, body);
      void client.invalidateQueries({ queryKey: keys.studioReleases });
      notify("Removed the old posting plan. Each schedule's release times apply now.", "success");
    },
    onError: (error: Error) =>
      notify(
        `The old posting plan wasn't removed: ${error.message} Try Remove the old plan again.`,
        "error",
      ),
  });
  const lead = useMutation({
    mutationFn: (hours: number) => saveLeadHours(api, hours),
    onSuccess: (body) => {
      client.setQueryData(planKey, body);
      void client.invalidateQueries({ queryKey: keys.studioReleases });
    },
  });
  const comment = useMutation({
    mutationFn: (on: boolean) => saveAutoComment(api, on),
    onSuccess: () => client.invalidateQueries({ queryKey: ["studio", "settings"] }),
    onError: (error: Error) => notify(`Not saved: ${error.message}`, "error"),
  });
  if (saved.data === undefined)
    return (
      <section aria-label="Release times" className="flex flex-col gap-3">
        <SectionHead as="h3" title="Release times" />
        {saved.error === null ? (
          <LoadingBlock label="Loading the release settings…" rows={2} rowClassName="h-10" />
        ) : (
          <LoadFailed
            what="The release settings"
            error={saved.error}
            onRetry={() => void saved.refetch()}
            retrying={saved.isFetching}
          />
        )}
      </section>
    );
  const old = saved.data.plan;
  // Each schedule by name, straight to the one whose release times to change.
  const live = (schedules.data ?? []).filter((one) => one.deletedAt === null);
  return (
    <section aria-label="Release times" className="flex flex-col gap-3">
      <SectionHead
        as="h3"
        title="Release times"
        className="pb-0"
        meta={
          <>
            Each schedule sets when its videos and shorts go out, under Edit on{" "}
            <TextLink to="/calendar" search={{ tab: "schedules" }}>
              Calendar → Schedules ↗
            </TextLink>
            .
          </>
        }
      />
      {live.length === 0 ? null : (
        <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-small">
          {live.map((one) => (
            <TextLink key={one.id} to="/calendar" search={{ tab: "schedules", schedule: one.id }}>
              {one.name}
            </TextLink>
          ))}
        </p>
      )}
      {old.rows.length > 0 ? (
        <Callout
          tone="info"
          title="An older posting plan still applies"
          actions={
            <Button
              variant="secondary"
              disabled={remove.isPending}
              onClick={() => remove.mutate(old)}
            >
              Remove the old plan
            </Button>
          }
        >
          <p className="m-0">
            {`It has ${String(old.rows.length)} line${old.rows.length === 1 ? "" : "s"}, and gives release times to projects no schedule made, and to a schedule's projects when its own times are taken. Set release times in your schedules, then remove it. Times already given keep.`}
          </p>
        </Callout>
      ) : null}
      <LeadTime
        stored={saved.data.leadHours}
        pending={lead.isPending}
        error={lead.error?.message}
        onSave={(hours, done) => lead.mutate(hours, { onSuccess: done })}
      />
      <Switch
        checked={autoComment === true}
        disabled={comment.isPending || autoComment === undefined}
        onChange={(on) => comment.mutate(on)}
        label="Post and pin each video's comment"
        help="Once the video is public, the extension posts its pinned comment in your name and pins it."
      />
    </section>
  );
}

// Upload lead time: a number with its Save and the saved tick, like the other numbers in
// Settings. What is typed stays until saved.
function LeadTime({
  stored,
  pending,
  error,
  onSave,
}: {
  readonly stored: number;
  readonly pending: boolean;
  readonly error: string | undefined;
  readonly onSave: (hours: number, done: () => void) => void;
}): ReactElement {
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), savedTickMs);
    return () => clearTimeout(timer);
  }, [saved]);
  const value = typed ?? String(stored);
  const hours = Number(value.trim());
  const problem =
    Number.isInteger(hours) && hours >= 1 && hours <= 168
      ? undefined
      : "A whole number of hours from 1 to 168.";
  return (
    <Field
      label="Upload lead time"
      help="So YouTube's copyright and ad checks finish while the video is still private."
      error={problem ?? (error === undefined ? undefined : `The lead time wasn't saved: ${error}`)}
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (problem !== undefined || pending) return;
          setSaved(false);
          onSave(hours, () => {
            setTyped(undefined);
            setSaved(true);
          });
        }}
      >
        <Input
          aria-label="Hours before release"
          type="number"
          inputMode="numeric"
          min={1}
          max={168}
          step={1}
          className="w-[88px] tabular-nums"
          value={value}
          onChange={(event) => setTyped(event.target.value)}
        />
        <span className="text-small text-ink-2">hours before release</span>
        <Button
          type="submit"
          disabled={problem !== undefined || pending || hours === stored}
          disabledReason={problem ?? "Nothing changed since the last save."}
        >
          Save
        </Button>
        <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
      </form>
    </Field>
  );
}

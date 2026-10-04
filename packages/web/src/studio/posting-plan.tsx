import type { PostingPlan } from "@app/slices/studio/plan-model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { readPostingPlan, saveAutoComment, saveLeadHours, savePostingPlan } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Input } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";

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
  const remove = useMutation({
    mutationFn: (current: PostingPlan) => savePostingPlan(api, { ...current, rows: [] }),
    onSuccess: (body) => {
      client.setQueryData(planKey, body);
      void client.invalidateQueries({ queryKey: ["studio", "releases"] });
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
  const old = saved.data?.plan;
  return (
    <section aria-label="Release times" className="flex flex-col gap-3">
      <SectionHead as="h3" title="Release times" />
      <p className="m-0 text-small text-ink-2">
        Each schedule sets when its videos and shorts go out, one line for each day it runs, with a
        time for every short its template makes:{" "}
        <Link to="/calendar" search={{ tab: "schedules" }}>
          Calendar → Schedules
        </Link>{" "}
        → Edit → Release times. See and move them in Calendar → Releases.
      </p>
      {old !== undefined && old.rows.length > 0 ? (
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

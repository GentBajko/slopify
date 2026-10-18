import { topicKey } from "@app/slices/schedules/score.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/kit/popover";
import { Badge } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import {
  calendarKey,
  heldTopicsKey,
  rescoreTopics,
  scheduleDetailKey,
  scheduleDetailQuery,
  schedulesKey,
  type TopicScores,
} from "./api";

export type TopicScore = TopicScores[string];

// A schedule's topic scores, by title; empty while ranking is off or they haven't loaded.
export function useTopicScores(scheduleId: string): (title: string) => TopicScore | undefined {
  const { api } = useApp();
  const details = useQuery(scheduleDetailQuery(api, scheduleId));
  const scores = details.data?.scores ?? {};
  return (title) => scores[topicKey(title)];
}

// "82", with why it scored so behind a press, the way a review's reasons open.
export function TopicScoreChip({
  title,
  score,
}: {
  readonly title: string;
  readonly score: TopicScore | undefined;
}): ReactElement | null {
  if (score === undefined) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Badge
        tone={score.score >= 70 ? "info" : "neutral"}
        title={`Score ${String(score.score)} of 100`}
      >
        {`Score ${String(score.score)}`}
      </Badge>
      <Popover>
        <PopoverTrigger
          type="button"
          aria-label={`Why “${title}” scored ${String(score.score)}`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-ink"
        >
          <InfoIcon aria-hidden="true" className="size-[15px]" />
        </PopoverTrigger>
        <PopoverContent className="space-y-1 leading-[1.45]">
          <p className="m-0 font-semibold text-ink">{`Score ${String(score.score)} of 100`}</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
            {score.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </span>
  );
}

// Rescore: scores every queued and held topic again and puts them in score order.
export function RescoreButton({
  scheduleId,
  scoring,
  disabled,
}: {
  readonly scheduleId: string;
  readonly scoring: "off" | "library" | "search";
  readonly disabled: boolean;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const rescore = useMutation({
    mutationFn: async () => {
      const reply = await rescoreTopics(api, scheduleId);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: schedulesKey }),
        client.invalidateQueries({ queryKey: scheduleDetailKey(scheduleId) }),
        client.invalidateQueries({ queryKey: heldTopicsKey(scheduleId) }),
        client.invalidateQueries({ queryKey: calendarKey }),
      ]);
      notify(
        "Topics rescored and put in score order. Your own and moved topics kept their places.",
        "success",
      );
    },
    onError: (error) => notify(`Topics weren't rescored: ${error.message}`, "error"),
  });
  return (
    <Button
      variant="quiet"
      size="small"
      disabled={disabled || scoring === "off" || rescore.isPending}
      disabledReason={
        scoring === "off"
          ? "Turn on Rank topics under Edit → Topic generation first"
          : rescore.isPending
            ? "Rescoring"
            : "Saving the last change"
      }
      onClick={() => rescore.mutate()}
    >
      {rescore.isPending ? "Rescoring…" : "Rescore"}
    </Button>
  );
}

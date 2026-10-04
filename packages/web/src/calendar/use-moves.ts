import type { Calendar } from "@app/slices/schedules/schema.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { useToast } from "@/components/kit/toast";
import {
  calendarKey,
  moveTopic,
  type ScheduleReply,
  schedulesKey,
  transferTopic,
} from "@/schedules/api";
import { type MoveResult, optimisticMove, undoOf } from "./moves";
import type { Drop } from "./plan";

type Applied = Extract<Drop, { readonly kind: "move" | "transfer" }>;

export interface MoveRequest {
  readonly drop: Applied;
  // The topic's title and where it went, for the toast.
  readonly title: string;
  readonly where: string;
  readonly undo?: boolean;
}

// Calendar's moves: a move within a schedule shows at once and is put back, with the reason,
// when the server refuses it (someone else changed the schedule meanwhile). Each landed move
// offers Undo, which moves the topic back.
export function useCalendarMoves(
  queryKey: readonly unknown[],
  onProblem: (text: string | null) => void,
) {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const mutation = useMutation({
    mutationFn: async ({ drop }: MoveRequest): Promise<ScheduleReply<MoveResult>> => {
      if (drop.kind === "move") {
        const reply = await moveTopic(api, drop.scheduleId, {
          baseVersion: drop.baseVersion,
          from: drop.from,
          to: drop.to,
        });
        return reply.ok ? { ok: true, value: { source: reply.value } } : reply;
      }
      return transferTopic(api, drop.scheduleId, {
        baseVersion: drop.baseVersion,
        index: drop.index,
        targetId: drop.targetId,
        ...(drop.position === undefined ? {} : { position: drop.position }),
      });
    },
    onMutate: async ({ drop }) => {
      await client.cancelQueries({ queryKey });
      const before = client.getQueryData<Calendar>(queryKey);
      if (before !== undefined) client.setQueryData(queryKey, optimisticMove(before, drop));
      onProblem(null);
      return { before };
    },
    onSuccess: (reply, request, context) => {
      if (!reply.ok) {
        if (context.before !== undefined) client.setQueryData(queryKey, context.before);
        onProblem(
          `${request.title} wasn't moved: ${reply.message} The calendar shows where it is now; move it again if you still want to.`,
        );
        return;
      }
      if (request.undo === true) {
        notify(`${request.title} is back where it was.`, "success");
        return;
      }
      notify(`Moved ${request.title} to ${request.where}.`, "success", {
        label: "Undo",
        run: () =>
          mutation.mutate({
            drop: undoOf(request.drop, reply.value),
            title: request.title,
            where: "",
            undo: true,
          }),
      });
    },
    onError: (cause: Error, request, context) => {
      if (context?.before !== undefined) client.setQueryData(queryKey, context.before);
      onProblem(
        `${request.title} wasn't moved: ${cause.message} The calendar has been read again; try the move once more.`,
      );
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: calendarKey }),
        client.invalidateQueries({ queryKey: schedulesKey }),
      ]);
    },
  });
  return mutation;
}

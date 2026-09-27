import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { SectionHead } from "@/components/kit/section-head";
import { Rail, RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { keys } from "@/queries";
import { onboardingKey, readSample, restoreSample, sampleKey } from "./api.js";

// Settings → Backup & storage → Sample project: bring back the bundled sample after it was
// deleted, or put back the original in place of the one on screen.
export function SampleSettings(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const sample = useQuery({ queryKey: sampleKey, queryFn: () => readSample(api) });
  const restore = useMutation({
    mutationFn: () => restoreSample(api),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: sampleKey });
      await client.invalidateQueries({ queryKey: onboardingKey });
      await client.invalidateQueries({ queryKey: keys.projects });
    },
  });
  const id = restore.data?.projectId ?? sample.data?.projectId ?? null;
  return (
    <div className="mt-8">
      <SectionHead
        title="Sample project"
        info="The finished example that comes with Slopify. Restore sample adds it back if it was deleted, or replaces it with the original. Your own copies of it are not touched."
      />
      <RailGroup>
        <Rail>
          <span className="min-w-0 flex-1 text-small text-ink2">
            {id === null
              ? "The sample is not in your projects."
              : "The sample is in your projects."}
          </span>
          {id === null ? null : (
            <Button asChild variant="ghost">
              <Link to="/projects/$projectId" params={{ projectId: id }}>
                Open
              </Link>
            </Button>
          )}
          <Button disabled={restore.isPending} onClick={() => restore.mutate()}>
            {restore.isPending ? "Restoring…" : "Restore sample"}
          </Button>
        </Rail>
      </RailGroup>
      <StatusSlot tone={restore.error ? "error" : "success"}>
        {restore.error?.message ??
          (restore.isSuccess ? "The sample is back in Projects." : undefined)}
      </StatusSlot>
    </div>
  );
}

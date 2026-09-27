import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { SectionHead } from "@/components/kit/section-head";
import { Rail, RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { keys } from "@/queries";
import { onboardingKey, readSample, restoreSample, type SampleProjects, sampleKey } from "./api.js";

const names: Readonly<Record<keyof SampleProjects, string>> = {
  library: "The Library of Alexandria",
  audiobook: "The Wind in the Willows (audiobook)",
  podcast: "The Antikythera Mechanism (podcast)",
};

// Settings → Backup & storage → Sample projects: bring back the bundled samples after one was
// deleted, or put back the originals in place of the ones on screen.
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
  const samples = restore.data?.samples ?? sample.data?.samples;
  return (
    <div className="mt-8">
      <SectionHead title="Sample projects" info="settings.sample.restore" />
      <RailGroup>
        {(Object.keys(names) as (keyof SampleProjects)[]).map((id) => {
          const projectId = samples?.[id] ?? null;
          return (
            <Rail key={id}>
              <span className="min-w-0 flex-1 text-small text-ink2">
                {names[id]}: {projectId === null ? "not in your projects" : "in your projects"}
              </span>
              {projectId === null ? null : (
                <Button asChild variant="ghost">
                  <Link to="/projects/$projectId" params={{ projectId }}>
                    Open
                  </Link>
                </Button>
              )}
            </Rail>
          );
        })}
        <Rail>
          <span className="min-w-0 flex-1 text-small text-ink2">
            Puts all three back as they shipped.
          </span>
          <Button disabled={restore.isPending} onClick={() => restore.mutate()}>
            {restore.isPending ? "Restoring…" : "Restore samples"}
          </Button>
        </Rail>
      </RailGroup>
      <StatusSlot tone={restore.error ? "error" : "success"}>
        {restore.error?.message ??
          (restore.isSuccess ? "The samples are back in Projects." : undefined)}
      </StatusSlot>
    </div>
  );
}

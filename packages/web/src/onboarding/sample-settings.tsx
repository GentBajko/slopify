import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
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
      <List label="Sample projects">
        {(Object.keys(names) as (keyof SampleProjects)[]).map((id) => {
          const projectId = samples?.[id] ?? null;
          return (
            <ListRow
              key={id}
              title={names[id]}
              meta={projectId === null ? "Not in your projects" : "In your projects"}
              actions={
                projectId === null ? undefined : (
                  <TextLink to="/projects/$projectId" params={{ projectId }}>
                    Open
                  </TextLink>
                )
              }
            />
          );
        })}
      </List>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={restore.isPending} onClick={() => restore.mutate()}>
          {restore.isPending ? "Restoring…" : "Restore samples"}
        </Button>
        <span className="text-small text-ink-2">Puts all three back as they shipped.</span>
      </div>
      <StatusSlot tone={restore.error ? "error" : "success"}>
        {restore.error?.message ??
          (restore.isSuccess ? "The samples are back in Projects." : undefined)}
      </StatusSlot>
    </div>
  );
}

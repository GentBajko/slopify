import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useToast } from "@/components/kit/toast";
import { sentence } from "@/http";
import { copySample, isSample, readSample, sampleKey } from "@/onboarding/api";
import { keys } from "@/queries";

// The bundled samples are read-only and never go to YouTube (the server refuses their release,
// link and upload writes): the YouTube section and Copy for YouTube Studio read them, and say
// so in one sentence where a form would be.

// Whether this project is one of the bundled samples; false until that is known.
export function useSampleProject(projectId: string): boolean {
  const { api } = useApp();
  const sample = useQuery({ queryKey: sampleKey, queryFn: () => readSample(api) });
  return isSample(sample.data, projectId);
}

// "The sample isn't on YouTube and can't be." with Make my own copy, in place of the Release
// dates and the YouTube links.
export function SampleNote({ projectId }: { readonly projectId: string }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const copy = useMutation({
    mutationFn: () => copySample(api, projectId),
    onSuccess: async ({ projectId: copied }) => {
      await client.invalidateQueries({ queryKey: keys.projects });
      await navigate({
        to: "/projects/$projectId",
        params: { projectId: copied },
        search: { section: "youtube" },
      });
    },
    onError: (error) =>
      notify(
        `${sentence(error.message)} The copy was not made. Press Make my own copy to try again.`,
        "error",
      ),
  });
  return (
    <section aria-label="Release and YouTube links" className="flex flex-col items-start gap-2">
      <h3 className="m-0 text-title-3 font-semibold text-ink">Release and YouTube links</h3>
      <p className="m-0 max-w-[var(--measure)] text-ink-2">
        This sample isn't on YouTube and can't be. Make your own copy to give it a release date,
        post it and keep its links, or to edit and write this text again.
      </p>
      <Button disabled={copy.isPending} onClick={() => copy.mutate()}>
        {copy.isPending ? "Copying…" : "Make my own copy"}
      </Button>
    </section>
  );
}

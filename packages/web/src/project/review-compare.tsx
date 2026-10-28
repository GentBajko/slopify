import type { RevisionOutputView, RevisionView } from "@app/slices/revisions/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import type { Api } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { type Aspect, MediaFrame } from "@/components/kit/media";
import { startedAt } from "@/lib/utils";
import { keys } from "@/queries";
import { revisionFileUrl, viewOf } from "./revision-api.js";
import { useCurrentRevisionView, useOutputMedia } from "./revision-media.js";

// ceiling: saved versions walked back looking for an earlier picture; past that Versions is
// the way to older ones.
const depth = 25;

interface Earlier {
  readonly url: string;
  readonly prompt: string | undefined;
  readonly savedAt: string;
}

// The picture this slot held before the current one: the nearest earlier saved version whose
// file for the same piece (`image:…`, `thumbnail:…`) differs. Undefined when there is none.
async function earlierPicture(
  api: Api,
  load: (revisionId: string) => Promise<RevisionView>,
  view: RevisionView,
  current: RevisionOutputView,
): Promise<Earlier | null> {
  let parent = view.revision.parentId;
  for (let step = 0; parent !== null && step < depth; step++) {
    const older = await load(parent);
    const row = older.outputs.find(
      (one) => one.selected && one.available && one.workKey === current.workKey,
    );
    if (row !== undefined && row.output.id !== current.output.id)
      return {
        url: revisionFileUrl(api, older.revision.projectId, older.revision.id, row.recordId),
        prompt: row.output.meta.prompt,
        savedAt: older.revision.createdAt,
      };
    parent = older.revision.parentId;
  }
  return null;
}

// A picture beside the one it replaced, to judge a remake or a replacement: before on the
// left, now on the right, each with the prompt that made it. `open` is what a tile's "Compare
// with previous" calls, defined only once an earlier picture is found: a project with one
// saved version has none, so it is never offered there. The search runs when `look` is called
// (the tile's More opening), or at once with `eager`, for a More that would hold nothing else.
export function useCompare(
  output: Output | undefined,
  name: string,
  aspect: Aspect,
  eager = false,
): {
  readonly open: (() => void) | undefined;
  readonly dialog: ReactElement | null;
  readonly look: () => void;
} {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  const { api } = useApp();
  const client = useQueryClient();
  const view = useCurrentRevisionView();
  const media = useOutputMedia(output);
  const current =
    output === undefined
      ? undefined
      : view?.outputs.find((row) => row.output.id === output.id && row.selected);
  const possible = view !== undefined && view.revision.parentId !== null && current !== undefined;
  const earlier = useQuery({
    queryKey: ["earlier-picture", view?.revision.id, current?.workKey],
    enabled: possible && (asked || eager),
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => {
      if (view === undefined || current === undefined) return null;
      const projectId = view.revision.projectId;
      return earlierPicture(
        api,
        (revisionId) =>
          client.fetchQuery({
            queryKey: keys.revision(projectId, revisionId),
            staleTime: Number.POSITIVE_INFINITY,
            queryFn: async () => {
              const reply = await viewOf(api, projectId, revisionId);
              if (!reply.ok) throw new Error(reply.message);
              return reply.value.view;
            },
          }),
        view,
        current,
      );
    },
  });
  const look = () => setAsked(true);
  const found = earlier.data ?? undefined;
  if (output === undefined || media === undefined || found === undefined)
    return { open: undefined, dialog: null, look };
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return {
    look,
    open: () => setOpen(true),
    dialog: (
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`${title}: before and now`}
        className="max-w-[min(1100px,calc(100vw-32px))]"
        footer={<Button onClick={() => setOpen(false)}>Close</Button>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Side
            label={`Before · saved ${startedAt(found.savedAt)}`}
            src={found.url}
            alt={`${title}, previous version`}
            prompt={found.prompt}
            aspect={aspect}
          />
          <Side
            label="Now"
            src={media.url}
            alt={`${title}, current version`}
            prompt={output.meta.prompt}
            aspect={aspect}
          />
        </div>
      </Dialog>
    ),
  };
}

function Side({
  label,
  src,
  alt,
  prompt,
  aspect,
}: {
  readonly label: string;
  readonly src: string;
  readonly alt: string;
  readonly prompt: string | undefined;
  readonly aspect: Aspect;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <MediaFrame src={src} alt={alt} aspect={aspect} title={label} />
      <p className="m-0 max-h-[160px] overflow-y-auto break-words text-small text-ink-2">
        {prompt === undefined || prompt.trim() === ""
          ? "No prompt is stored with this picture: it was uploaded, or made before prompts were kept."
          : `Prompt: ${prompt}`}
      </p>
    </div>
  );
}

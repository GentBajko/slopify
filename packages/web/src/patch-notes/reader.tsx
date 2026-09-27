import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { ReadingView } from "@/components/kit/reading-view";
import { patchNoteQuery } from "./api.js";

// One set of patch notes in the kit's reading view: contents from its `##` headings, search,
// and copy. Settings → Patch notes and the notes that open by themselves after an update both
// show it.
export function PatchNoteReader({
  id,
  className,
}: {
  readonly id: string;
  readonly className?: string;
}): ReactElement {
  const { api } = useApp();
  const note = useQuery(patchNoteQuery(api, id));
  if (note.error !== null)
    return (
      <Callout
        tone="danger"
        title="These patch notes did not load"
        actions={<Button onClick={() => void note.refetch()}>Try again</Button>}
      >
        {`${note.error.message} Press Try again, or reload the page.`}
      </Callout>
    );
  return (
    <ReadingView
      markdown={note.data ?? ""}
      label="Patch notes"
      anchorPrefix={`patch-${id}-`}
      {...(className === undefined ? {} : { className })}
    >
      <p className="m-0 text-ink-3">Loading the patch notes…</p>
    </ReadingView>
  );
}

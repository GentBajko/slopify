import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Select } from "@/components/kit/field";
import { patchNotesQuery } from "./api.js";
import { PatchNoteReader } from "./reader.js";

// Settings → What's new. Which version's notes are open is the page's `note` search parameter,
// so Back and a shared address both work; without one the newest are open. One select picks
// the version, so the page is the notes, not a list of every release.
export function PatchNotesSettings({
  note,
  onNote,
}: {
  readonly note?: string | undefined;
  readonly onNote: (note: string | undefined) => void;
}): ReactElement {
  const { api } = useApp();
  const list = useQuery(patchNotesQuery(api));

  if (list.error !== null)
    return (
      <Callout
        tone="danger"
        title="What's new did not load"
        actions={<Button onClick={() => void list.refetch()}>Try again</Button>}
      >
        {`${list.error.message} Press Try again, or reload the page.`}
      </Callout>
    );
  if (list.data === undefined) return <p className="m-0 text-ink-3">Loading what's new…</p>;

  const { notes, version } = list.data;
  const [latest] = notes;
  if (latest === undefined)
    return <p className="m-0 text-ink-2">This version of Slopify has no patch notes.</p>;
  const picked = note === undefined ? undefined : notes.find((item) => item.id === note);
  const shown = picked ?? latest;

  return (
    <div className="flex flex-col gap-4">
      {note !== undefined && picked === undefined ? (
        <p role="status" className="m-0 text-small text-ink-2">
          {`There are no patch notes called "${note}" in this version. The newest are below.`}
        </p>
      ) : null}
      {/* The notes open with their own versions and release date, so the select says only
          which is the one running. */}
      <Field
        label="Version"
        {...(shown.version === version ? { help: "The version you are running." } : {})}
        className="max-w-[360px]"
      >
        <Select
          value={shown.id}
          options={notes.map((item) => ({
            value: item.id,
            label: item.version === version ? `${item.title} (yours)` : item.title,
          }))}
          onChange={(event) =>
            onNote(event.target.value === latest.id ? undefined : event.target.value)
          }
        />
      </Field>
      <PatchNoteReader id={shown.id} untitled />
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { type PatchNotesView, patchNotesQuery } from "./api.js";
import { PatchNoteReader } from "./reader.js";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "2026-09-27" as "27 September 2026", the way the notes themselves write dates.
export function noteDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const name = months[(month ?? 0) - 1];
  return name === undefined || day === undefined ? date : `${String(day)} ${name} ${String(year)}`;
}

type Note = PatchNotesView["notes"][number];

function noteMeta(note: Note, version: string): string {
  const covers = note.range === undefined ? note.version : `Versions ${note.range}`;
  const parts = [covers, `released ${noteDate(note.date)}`].filter(
    (part): part is string => part !== undefined,
  );
  const line = parts.join(", ");
  const sentence = line.charAt(0).toUpperCase() + line.slice(1);
  return note.version === version ? `${sentence}. The version you are running.` : `${sentence}.`;
}

// Settings → Patch notes. Which earlier note is open is the page's `note` search parameter,
// so Back and a shared address both work.
//
// The newest notes are open at the top. Every older version is folded under "Earlier
// versions" and opens on its own when picked, so the page is never one long read of
// everything.
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
        title="The patch notes did not load"
        actions={<Button onClick={() => void list.refetch()}>Try again</Button>}
      >
        {`${list.error.message} Press Try again, or reload the page.`}
      </Callout>
    );
  if (list.data === undefined) return <p className="m-0 text-ink-3">Loading the patch notes…</p>;

  const { notes, version } = list.data;
  const [latest, ...earlier] = notes;
  if (latest === undefined)
    return <p className="m-0 text-ink-2">This version of Slopify has no patch notes.</p>;
  const picked = note === undefined ? undefined : notes.find((item) => item.id === note);
  const older = picked !== undefined && picked.id !== latest.id ? picked : undefined;

  if (older !== undefined)
    return (
      <div className="flex flex-col gap-4">
        <div>
          <Button variant="quiet" onClick={() => onNote(undefined)}>
            <ArrowLeftIcon aria-hidden="true" strokeWidth={1.75} />
            Back to the latest patch notes
          </Button>
        </div>
        <SectionHead title="Earlier version" meta={noteMeta(older, version)} />
        <PatchNoteReader id={older.id} />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {note !== undefined && picked === undefined ? (
        <p role="status" className="m-0 text-small text-ink-2">
          {`There are no patch notes called "${note}" in this version. The latest are below; older ones are under Earlier versions.`}
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        <SectionHead
          title="Latest version"
          meta={noteMeta(latest, version)}
          info="settings.patch-notes"
        />
        <PatchNoteReader id={latest.id} />
      </div>
      {earlier.length === 0 ? null : (
        <details className="max-w-prose border-t border-line py-3">
          <summary className="cursor-pointer font-semibold">
            {`Earlier versions (${String(earlier.length)})`}
          </summary>
          <List label="Earlier versions" className="mt-2">
            {earlier.map((item) => (
              <ListRow
                key={item.id}
                title={item.title}
                meta={noteMeta(item, version)}
                onSelect={() => onNote(item.id)}
                actions={
                  <Button aria-label={`Read ${item.title}`} onClick={() => onNote(item.id)}>
                    Read
                  </Button>
                }
              />
            ))}
          </List>
        </details>
      )}
    </div>
  );
}

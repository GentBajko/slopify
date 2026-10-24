import { thumbnailCountOf } from "@app/slices/admission/model.js";
import type { RevisionView } from "@app/slices/revisions/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { DownloadIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { FileLink } from "@/components/kit/link";
import { setZipUrl, type ZipSet } from "./output-api.js";
import { outputLabel } from "./output-label.js";
import { outdatedWords } from "./output-status.js";
import { when } from "./project-outputs-model.js";
import { useCurrentRevisionView, useOutputMediaList } from "./revision-media.js";

const setNames: Readonly<Record<ZipSet, string>> = {
  images: "images",
  thumbnails: "thumbnails",
  shorts: "shorts",
};

// "Download all 4 images (.zip)", "Download both shorts (.zip)": what the zip holds, counted.
export function setDownloadWords(set: ZipSet, count: number): string {
  return count === 2
    ? `Download both ${setNames[set]} (.zip)`
    : `Download all ${String(count)} ${setNames[set]} (.zip)`;
}

interface SetRow {
  readonly output: Output;
  readonly recordId: string | undefined;
  readonly older: boolean;
}

// The members the saved version still holds, each with its record and whether an edit made
// it the previous version.
function setRows(view: RevisionView | undefined, members: readonly Output[]): readonly SetRow[] {
  return members.flatMap((output) => {
    const row = view?.outputs.find((one) => one.selected && one.output.id === output.id);
    if (view !== undefined && (row === undefined || !row.available)) return [];
    return [{ output, recordId: row?.recordId, older: row?.state === "outdated" }];
  });
}

// The records the server's zip of this set would hold on its own (the images zip holds the
// thumbnails too), so a zip of fewer names exactly the ones it should.
function wholeSet(view: RevisionView, set: ZipSet): ReadonlySet<string> {
  const thumbnails = thumbnailCountOf(view.revision.config);
  const thumbnail = (output: Output) =>
    output.role === "thumbnail" && (output.meta.index ?? 1) <= thumbnails;
  return new Set(
    view.outputs
      .filter(
        (row) =>
          row.selected &&
          (set === "images"
            ? row.output.role === "image" || thumbnail(row.output)
            : set === "thumbnails"
              ? thumbnail(row.output)
              : row.output.role === "short_video"),
      )
      .map((row) => row.recordId),
  );
}

function zipOf(
  view: RevisionView | undefined,
  set: ZipSet,
  rows: readonly SetRow[],
): readonly string[] | undefined {
  if (view === undefined) return undefined;
  const picked = rows.flatMap((row) => (row.recordId === undefined ? [] : [row.recordId]));
  const whole = wholeSet(view, set);
  return picked.length === whole.size && picked.every((id) => whole.has(id)) ? undefined : picked;
}

// Download all for a set of files (images, thumbnails, shorts) as one zip, named with what it
// holds. A direct download while every file is current; once an edit made some of them the
// previous version, the files are listed first, each with a tick, so the zip holds exactly
// the ones picked.
export function SetDownload({
  projectId,
  set,
  members,
  variant = "secondary",
}: {
  readonly projectId: string;
  readonly set: ZipSet;
  readonly members: readonly Output[];
  readonly variant?: "primary" | "secondary";
}): ReactElement | null {
  const { api } = useApp();
  const view = useCurrentRevisionView();
  const [open, setOpen] = useState(false);
  // Nothing until the files can be fetched: a saved version's files once it has loaded.
  const files = useOutputMediaList(members);
  const rows = setRows(view, members);
  if (rows.length === 0 || files.size === 0) return null;
  if (!rows.some((row) => row.older))
    return (
      <FileLink
        href={setZipUrl(api, projectId, view?.revision.id ?? null, set, zipOf(view, set, rows))}
        download
        variant={variant}
      >
        <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
        {setDownloadWords(set, rows.length)}
      </FileLink>
    );
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
        {`Choose ${setNames[set]} to download…`}
      </Button>
      {open ? (
        <SetDownloadDialog
          projectId={projectId}
          set={set}
          rows={rows}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function SetDownloadDialog({
  projectId,
  set,
  rows,
  onClose,
}: {
  readonly projectId: string;
  readonly set: ZipSet;
  readonly rows: readonly SetRow[];
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const view = useCurrentRevisionView();
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(rows.map((row) => row.output.id)),
  );
  const chosen = rows.filter((row) => picked.has(row.output.id));
  // A project without saved versions zips everything; picking needs the version's records.
  const pickable = view !== undefined;
  const href = setZipUrl(
    api,
    projectId,
    view?.revision.id ?? null,
    set,
    pickable ? zipOf(view, set, chosen) : undefined,
  );
  const version =
    view === undefined
      ? "The project's current files."
      : `From the version saved ${when(view.revision.createdAt)}${view.current ? ", the current one" : ""}.`;
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Choose ${setNames[set]} to download`}
      description={version}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {chosen.length === 0 ? (
            <Button variant="primary" disabled disabledReason="Tick at least one file to download">
              Download zip
            </Button>
          ) : (
            <FileLink href={href} download variant="primary" onClick={onClose}>
              <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
              {`Download zip (${String(chosen.length)} ${chosen.length === 1 ? "file" : "files"})`}
            </FileLink>
          )}
        </>
      }
    >
      <ul
        aria-label="Files in the zip"
        className="m-0 flex max-h-[50vh] list-none flex-col gap-1 overflow-y-auto p-0"
      >
        {rows.map((row) => (
          <li key={row.output.id}>
            <label className="flex items-start gap-2 text-small">
              <input
                type="checkbox"
                className="mt-1"
                disabled={!pickable}
                checked={picked.has(row.output.id)}
                onChange={(event) => {
                  const next = new Set(picked);
                  if (event.target.checked) next.add(row.output.id);
                  else next.delete(row.output.id);
                  setPicked(next);
                }}
              />
              <span className="min-w-0">
                <span className="text-ink">{outputLabel(row.output)}</span>
                <span className="text-ink-2">
                  {` · made ${when(row.output.createdAt)}`}
                  {row.older ? ` · previous version: ${outdatedWords(row.output.role)}` : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

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
import { useCurrentRevisionView } from "./revision-media.js";

const setNames: Readonly<Record<ZipSet, string>> = {
  images: "images",
  thumbnails: "thumbnails",
  shorts: "shorts",
};

// Download all for a set of files (images, thumbnails, shorts), with the files listed first:
// which version of the project they come from, which are older versions, and a tick for each
// so the zip holds exactly the files picked. Nothing downloads until Download zip.
export function SetDownload({
  projectId,
  set,
  members,
  variant = "primary",
}: {
  readonly projectId: string;
  readonly set: ZipSet;
  readonly members: readonly Output[];
  readonly variant?: "primary" | "secondary";
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (members.length === 0) return null;
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
        {`Download all ${setNames[set]}`}
      </Button>
      {open ? (
        <SetDownloadDialog
          projectId={projectId}
          set={set}
          members={members}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function SetDownloadDialog({
  projectId,
  set,
  members,
  onClose,
}: {
  readonly projectId: string;
  readonly set: ZipSet;
  readonly members: readonly Output[];
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const view = useCurrentRevisionView();
  const rows = members.flatMap((output) => {
    const row = view?.outputs.find((one) => one.selected && one.output.id === output.id);
    if (view !== undefined && (row === undefined || !row.available)) return [];
    return [{ output, recordId: row?.recordId, older: row?.state === "outdated" }];
  });
  const [picked, setPicked] = useState<ReadonlySet<string>>(
    () => new Set(rows.map((row) => row.output.id)),
  );
  const chosen = rows.filter((row) => picked.has(row.output.id));
  const all = chosen.length === rows.length;
  // A project without saved versions zips everything; picking needs the version's records.
  const pickable = view !== undefined;
  const href = setZipUrl(
    api,
    projectId,
    view?.revision.id ?? null,
    set,
    all || !pickable
      ? undefined
      : chosen.flatMap((row) => (row.recordId === undefined ? [] : [row.recordId])),
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
      title={`Download ${setNames[set]}`}
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useId, useState } from "react";
import {
  type LibraryItemKind,
  type LibraryVersion,
  readLibraryHistory,
  readLibraryUsedBy,
  restoreLibraryVersion,
  type UsedBy,
} from "@/api";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Drawer } from "@/components/kit/drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/ui/picker";
import { keys } from "@/queries";
import { DiffColumns } from "./diff-view";

export const historyKeys = {
  versions: (item: LibraryItemKind, id: string) => ["library-history", item, id] as const,
  usedBy: (item: LibraryItemKind, id: string) => ["library-used-by", item, id] as const,
};

// Library → History: every saved version of one prompt or intro/outro, two of them side by side
// with the changed words marked, Restore for an older one, and what uses it now. A drawer, so
// the list it was opened from stays in view.
export function HistoryDrawer({
  item,
  id,
  name,
  onClose,
}: {
  readonly item: LibraryItemKind;
  readonly id: string;
  readonly name: string;
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: historyKeys.versions(item, id),
    queryFn: () => readLibraryHistory(api, item, id),
  });
  const usedBy = useQuery({
    queryKey: historyKeys.usedBy(item, id),
    queryFn: () => readLibraryUsedBy(api, item, id),
  });
  const versions = history.data?.versions ?? [];
  const [picked, setPicked] = useState<{ before?: number; after?: number }>({});
  const after = picked.after ?? versions[0]?.version;
  const before = picked.before ?? versions[1]?.version ?? after;
  const older = versions.find((one) => one.version === before);
  const newer = versions.find((one) => one.version === after);
  const [status, setStatus] = useState<string | undefined>();
  const restore = useMutation({
    mutationFn: (version: number) => restoreLibraryVersion(api, item, id, version),
    onSuccess: async (_value, version) => {
      setStatus(`Restored version ${String(version)} as a new version.`);
      setPicked({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: historyKeys.versions(item, id) }),
        queryClient.invalidateQueries({
          queryKey: item === "prompt" ? keys.prompts : keys.entries,
        }),
      ]);
    },
    onError: () => setStatus(undefined),
  });
  const beforeId = useId();
  const afterId = useId();
  const latest = versions[0]?.version;

  return (
    <Drawer
      open
      title={`History of ${name}`}
      onClose={onClose}
      className="sm:w-[min(1080px,100vw)]"
    >
      <div className="flex flex-col gap-6">
        {history.error === null ? null : (
          <p className="text-body text-red">{history.error.message}</p>
        )}
        <section aria-labelledby={`${beforeId}-compare`} className="flex flex-col gap-3">
          <h3 id={`${beforeId}-compare`} className="text-row font-semibold">
            Compare
          </h3>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={beforeId}>Older</Label>
              <Picker
                id={beforeId}
                value={before === undefined ? "" : String(before)}
                disabled={versions.length === 0}
                onChange={(event) =>
                  setPicked((now) => ({ ...now, before: Number(event.currentTarget.value) }))
                }
              >
                {versions.map((one) => (
                  <option key={one.version} value={one.version}>
                    {versionLabel(one, latest)}
                  </option>
                ))}
              </Picker>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={afterId}>Newer</Label>
              <Picker
                id={afterId}
                value={after === undefined ? "" : String(after)}
                disabled={versions.length === 0}
                onChange={(event) =>
                  setPicked((now) => ({ ...now, after: Number(event.currentTarget.value) }))
                }
              >
                {versions.map((one) => (
                  <option key={one.version} value={one.version}>
                    {versionLabel(one, latest)}
                  </option>
                ))}
              </Picker>
            </div>
          </div>
          {older === undefined || newer === undefined ? (
            <p className="text-small text-ink2">
              {history.isPending ? "Loading the versions…" : "No versions to compare."}
            </p>
          ) : (
            <>
              {older.name === newer.name ? null : (
                <p className="text-small text-ink2">{`Renamed from "${older.name}" to "${newer.name}".`}</p>
              )}
              <DiffColumns
                before={older.body}
                after={newer.body}
                beforeLabel={`Version ${String(older.version)}`}
                afterLabel={`Version ${String(newer.version)}`}
              />
            </>
          )}
        </section>

        <section aria-labelledby={`${beforeId}-versions`} className="flex flex-col gap-2">
          <h3 id={`${beforeId}-versions`} className="text-row font-semibold">
            Versions
          </h3>
          <ol className="flex flex-col">
            {versions.map((one) => (
              <li
                key={one.version}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 text-small">
                  <span className="font-semibold text-ink">{`Version ${String(one.version)}`}</span>
                  <span className="text-ink2">
                    {` · ${one.author} · ${when(one.createdAt)}`}
                    {one.restoredFrom === null
                      ? ""
                      : ` · restored from version ${String(one.restoredFrom)}`}
                  </span>
                </span>
                {one.version === latest ? (
                  <span className="text-small text-ink2">Current</span>
                ) : (
                  <Button
                    type="button"
                    aria-label={`Restore version ${String(one.version)}`}
                    disabled={restore.isPending}
                    onClick={() => {
                      setStatus(undefined);
                      restore.mutate(one.version);
                    }}
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ol>
          <StatusSlot tone={restore.error === null ? "success" : "error"}>
            {restore.error?.message ?? status}
          </StatusSlot>
        </section>

        <UsedBySection usedBy={usedBy.data} error={usedBy.error} />
      </div>
    </Drawer>
  );
}

function UsedBySection({
  usedBy,
  error,
}: {
  readonly usedBy: UsedBy | undefined;
  readonly error: Error | null;
}): ReactElement {
  const id = useId();
  const counts =
    usedBy === undefined
      ? undefined
      : [
          plural(usedBy.templates.length, "template"),
          plural(usedBy.schedules.length, "schedule"),
          plural(usedBy.projects.length, "project"),
        ].join(", ");
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-row font-semibold">
        {counts === undefined ? "Used by" : `Used by ${counts}`}
      </h3>
      {error === null ? null : <p className="text-body text-red">{error.message}</p>}
      {usedBy === undefined ? null : usedBy.templates.length +
          usedBy.schedules.length +
          usedBy.projects.length ===
        0 ? (
        <p className="text-small text-ink2">Nothing uses it yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-small">
          {usedBy.templates.map((one) => (
            <li key={`t-${one.id}`}>
              <span className="text-ink2">Template </span>
              <Link to="/templates" className="text-run-text underline underline-offset-[3px]">
                {one.name}
              </Link>
            </li>
          ))}
          {usedBy.schedules.map((one) => (
            <li key={`s-${one.id}`}>
              <span className="text-ink2">Schedule </span>
              <Link to="/schedules" className="text-run-text underline underline-offset-[3px]">
                {one.name}
              </Link>
              <span className="text-ink2">{one.status === "paused" ? " (paused)" : ""}</span>
            </li>
          ))}
          {usedBy.projects.map((one) => (
            <li key={`p-${one.id}`}>
              <span className="text-ink2">Project </span>
              <Link
                to="/projects/$projectId"
                params={{ projectId: one.id }}
                className="text-run-text underline underline-offset-[3px]"
              >
                {one.title}
              </Link>
              <span className="text-ink2">
                {one.totalRevisions === 0
                  ? ""
                  : ` · ${String(one.revisions)} of ${String(one.totalRevisions)} ${one.totalRevisions === 1 ? "revision" : "revisions"}${one.current ? ", including the current one" : ", not the current one"}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

function versionLabel(version: LibraryVersion, latest: number | undefined): string {
  return `Version ${String(version.version)}${version.version === latest ? " (current)" : ""} · ${when(version.createdAt)}`;
}

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

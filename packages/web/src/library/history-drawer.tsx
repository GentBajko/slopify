import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import {
  type LibraryItemKind,
  type LibraryVersion,
  readLibraryHistory,
  readLibraryUsedBy,
  restoreLibraryVersion,
} from "@/api";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { Field, Select } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { keys } from "@/queries";
import { DiffColumns } from "./diff-view";

export const historyKeys = {
  versions: (item: LibraryItemKind, id: string) => ["library-history", item, id] as const,
  usedBy: (item: LibraryItemKind, id: string) => ["library-used-by", item, id] as const,
};

// The saved versions of one prompt or intro/outro, newest first. The Library detail and the
// History drawer share the one query, so opening the drawer never refetches.
export function useLibraryHistory(item: LibraryItemKind, id: string) {
  const { api } = useApp();
  return useQuery({
    queryKey: historyKeys.versions(item, id),
    queryFn: () => readLibraryHistory(api, item, id),
  });
}

export function useLibraryUsedBy(item: LibraryItemKind, id: string) {
  const { api } = useApp();
  return useQuery({
    queryKey: historyKeys.usedBy(item, id),
    queryFn: () => readLibraryUsedBy(api, item, id),
  });
}

// Library → History: every saved version of one prompt or intro/outro, any two of them side by
// side with the changed words marked, and Restore for an older one. A drawer, so the list it
// was opened from stays in view; what uses the item is in the detail beside the list.
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
  const history = useLibraryHistory(item, id);
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
  const latest = versions[0]?.version;

  return (
    <Drawer
      open
      title={`History of ${name}`}
      onClose={onClose}
      className="sm:w-[min(1080px,100vw)]"
    >
      <div className="flex flex-col gap-8">
        {history.error === null ? null : (
          <p className="m-0 text-body text-danger">
            {`The history couldn't be read: ${history.error.message}`}
          </p>
        )}
        <section className="flex flex-col gap-3">
          <SectionHead title="Compare" as="h3" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Older" tip="library.history.compare">
              <Select
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
              </Select>
            </Field>
            <Field label="Newer" tip="library.history.compare">
              <Select
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
              </Select>
            </Field>
          </div>
          {older === undefined || newer === undefined ? (
            <p className="m-0 text-small text-ink-2">
              {history.isPending ? "Loading the versions…" : "No versions to compare."}
            </p>
          ) : (
            <>
              {older.name === newer.name ? null : (
                <p className="m-0 text-small text-ink-2">{`Renamed from "${older.name}" to "${newer.name}".`}</p>
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

        <section className="flex flex-col gap-2">
          <SectionHead title="Versions" as="h3" info="library.history.versions" />
          <List label={`Versions of ${name}`}>
            {versions.map((one) => (
              <ListRow
                key={one.version}
                title={`Version ${String(one.version)}`}
                meta={versionMeta(one)}
                actions={
                  one.version === latest ? (
                    <span className="text-small text-ink-2">Current</span>
                  ) : (
                    <Button
                      size="small"
                      aria-label={`Restore version ${String(one.version)}`}
                      disabled={restore.isPending}
                      disabledReason="Restoring a version"
                      onClick={() => {
                        setStatus(undefined);
                        restore.mutate(one.version);
                      }}
                    >
                      Restore
                    </Button>
                  )
                }
              />
            ))}
          </List>
          <StatusSlot tone={restore.error === null ? "success" : "error"}>
            {restore.error?.message ?? status}
          </StatusSlot>
        </section>
      </div>
    </Drawer>
  );
}

export function versionMeta(version: LibraryVersion): string {
  return `${version.author} · ${when(version.createdAt)}${
    version.restoredFrom === null ? "" : ` · restored from version ${String(version.restoredFrom)}`
  }`;
}

function versionLabel(version: LibraryVersion, latest: number | undefined): string {
  return `Version ${String(version.version)}${version.version === latest ? " (current)" : ""} · ${when(version.createdAt)}`;
}

export function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

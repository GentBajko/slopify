import type { ProjectListing } from "@app/slices/admission/model.js";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { type Api, moveProjectsToChannel, removeProject } from "@/api";
import { useApp } from "@/app-context";
import { useCurrentChannel } from "@/channels/current";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Select } from "@/components/kit/field";
import { useToast } from "@/components/kit/toast";
import { counted, type Selection, SelectionBar } from "@/components/selection";
import { eachOf, useBulkMarkUploaded } from "@/home/bulk-uploaded";
import { isReadyToUpload } from "@/home/ready";
import { keys } from "@/queries";
import { restoreTrashItems, trashKey } from "@/trash/api";
import { RemakeOutdated } from "./projects-remake-review.js";

// The Projects list's selection bar: Mark uploaded, Mark not uploaded, Move to a channel and
// Delete for the ticked rows, each announced in a toast with Undo where it can be taken back.
// Remake outdated checks the ticked projects and opens one scope and cost review first
// (projects-remake-review.tsx).

type Notify = ReturnType<typeof useToast>;

const projectsWord = (count: number): string => counted(count, "project", "projects");

async function refresh(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.projects }),
    client.invalidateQueries({ queryKey: trashKey }),
  ]);
}

// Undo for a delete: the projects come back out of the trash.
export async function restoreProjects(
  api: Api,
  client: QueryClient,
  notify: Notify,
  projects: readonly ProjectListing[],
): Promise<void> {
  try {
    const answer = await restoreTrashItems(
      api,
      projects.map((one) => ({ kind: "project" as const, id: one.id })),
    );
    if (answer.failed.length > 0) {
      const first = answer.failed[0];
      notify(
        `${projectsWord(answer.failed.length)} couldn't be restored: ${first?.reason ?? ""} Restore ${answer.failed.length === 1 ? "it" : "them"} in Settings → Backup & storage → Trash.`,
        "error",
      );
    } else notify(`Restored ${projectsWord(answer.restored.length)}.`, "success");
  } catch (error) {
    notify(
      `The projects weren't restored: ${error instanceof Error ? error.message : String(error)} Restore them in Settings → Backup & storage → Trash.`,
      "error",
    );
  } finally {
    await refresh(client);
  }
}

export function ProjectsBulkBar({
  selection,
  rows,
  scope,
  samples,
}: {
  readonly selection: Selection<string>;
  // The bundled sample projects, which Remake outdated leaves out.
  readonly samples: ReadonlySet<string>;
  // The rows the list draws, in order; Select all covers these.
  readonly rows: readonly ProjectListing[];
  // "Select all 12 shown" when a filter, a search or Show more leaves rows out.
  readonly scope?: string;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const current = useCurrentChannel();
  const [target, setTarget] = useState("");
  const [confirming, setConfirming] = useState(false);
  const chosen = rows.filter((one) => selection.has(one.id));
  const deletable = chosen.filter((one) => one.status !== "running");
  const ready = chosen.filter(isReadyToUpload);
  const uploaded = chosen.filter((one) => one.uploadedAt !== null);

  const report = (
    failed: readonly { readonly project: ProjectListing; readonly reason: string }[],
    what: string,
    fix: string,
  ): void => {
    const first = failed[0];
    if (first === undefined) return;
    notify(
      `${projectsWord(failed.length)} ${failed.length === 1 ? "wasn't" : "weren't"} ${what}: "${first.project.title}": ${first.reason} ${fix}`,
      "error",
    );
  };

  const remove = useMutation({
    mutationFn: (list: readonly ProjectListing[]) =>
      eachOf(list, (one) => removeProject(api, one.id)),
    onSuccess: ({ done, failed }) => {
      if (done.length > 0)
        notify(`Moved ${projectsWord(done.length)} to the trash.`, "success", {
          label: "Undo",
          run: () => void restoreProjects(api, client, notify, done),
        });
      report(failed, "deleted", "Cancel a running project first, then press Delete again.");
    },
    onSettled: async () => {
      setConfirming(false);
      selection.clear();
      await refresh(client);
    },
  });

  const mark = useBulkMarkUploaded({ noun: ["project", "projects"], onSettled: selection.clear });

  const move = useMutation({
    mutationFn: async (input: { readonly list: readonly ProjectListing[]; readonly to: string }) =>
      moveProjectsToChannel(
        api,
        input.list.map((one) => one.id),
        input.to,
      ),
    onSuccess: (answer, input) => {
      const name = current.channels.find((one) => one.id === input.to)?.name ?? "the channel";
      // Undo sends each project back to the channel it came from.
      const from = new Map<string, ProjectListing[]>();
      for (const one of input.list) {
        const channel = one.channelId ?? current.channels[0]?.id;
        if (channel === undefined || channel === input.to) continue;
        from.set(channel, [...(from.get(channel) ?? []), one]);
      }
      notify(
        `Moved ${projectsWord(answer.moved)} to ${name}.`,
        "success",
        from.size === 0
          ? undefined
          : {
              label: "Undo",
              run: () => {
                for (const [channel, list] of from) move.mutate({ list, to: channel });
              },
            },
      );
      setTarget("");
    },
    onError: (error: Error) =>
      notify(
        `The projects weren't moved: ${error.message} Pick the channel again and press Move.`,
        "error",
      ),
    onSettled: async () => {
      selection.clear();
      await client.invalidateQueries({ queryKey: keys.projects });
    },
  });

  const busy = remove.isPending || mark.isPending || move.isPending;
  const none = selection.count === 0;
  const reason = (empty: string): string =>
    none ? "Nothing is selected" : busy ? "Working on it" : empty;
  const running = chosen.length - deletable.length;
  const channelName = current.channels.find((one) => one.id === target)?.name ?? "";

  return (
    <>
      <SelectionBar
        selection={selection}
        total={rows.length}
        noun={["project", "projects"]}
        {...(scope === undefined ? {} : { scope })}
        actions={
          <>
            <Button
              size="small"
              disabled={busy || ready.length === 0}
              disabledReason={reason("None of the selected projects is ready to upload")}
              onClick={() => mark.mutate({ list: ready, on: true })}
            >
              Mark uploaded
            </Button>
            {uploaded.length === 0 ? null : (
              <Button
                size="small"
                variant="quiet"
                disabled={busy}
                disabledReason="Working on it"
                onClick={() => mark.mutate({ list: uploaded, on: false })}
              >
                Mark not uploaded
              </Button>
            )}
            {current.channels.length < 2 ? null : (
              <span className="flex items-center gap-2">
                <Select
                  aria-label="Channel to move the selected projects to"
                  className="w-[180px]"
                  value={target}
                  onChange={(event) => setTarget(event.currentTarget.value)}
                  options={[
                    { value: "", label: "Move to channel…" },
                    ...current.channels.map((one) => ({ value: one.id, label: one.name })),
                  ]}
                />
                <Button
                  size="small"
                  disabled={busy || none || target === ""}
                  disabledReason={reason("Pick the channel to move them to")}
                  onClick={() => move.mutate({ list: chosen, to: target })}
                >
                  {channelName === "" ? "Move" : `Move to ${channelName}`}
                </Button>
              </span>
            )}
            <RemakeOutdated
              chosen={chosen}
              samples={samples}
              busy={busy}
              onDone={selection.clear}
            />
            <Button
              size="small"
              variant="destructive"
              disabled={busy || deletable.length === 0}
              disabledReason={reason("Running projects can't be deleted. Cancel the run first.")}
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          </>
        }
      />
      <ConfirmDialog
        open={confirming}
        title={`Delete ${projectsWord(deletable.length)}?`}
        consequence={`Moves ${deletable.length === 1 ? `"${deletable[0]?.title ?? ""}"` : `these ${String(deletable.length)} projects`} to the trash for 30 days. Undo brings them back, or restore them later in Settings → Backup & storage → Trash.${
          running === 0
            ? ""
            : ` ${projectsWord(running)} still running ${running === 1 ? "stays" : "stay"}: cancel the run first.`
        }`}
        confirmLabel={`Delete ${projectsWord(deletable.length)}`}
        cancelLabel="Keep them"
        pending={remove.isPending}
        onConfirm={() => remove.mutate(deletable)}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

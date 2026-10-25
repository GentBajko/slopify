import type { ProjectListing } from "@app/slices/admission/model.js";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { type Api, moveProjectsToChannel, removeProject } from "@/api";
import { useApp } from "@/app-context";
import { useCurrentChannel } from "@/channels/current";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Select } from "@/components/kit/field";
import { type ToastAction, useToast } from "@/components/kit/toast";
import { counted, type Selection, SelectionBar } from "@/components/selection";
import { eachOf, useBulkMarkUploaded } from "@/home/bulk-uploaded";
import { isReadyToUpload } from "@/home/ready";
import { keys } from "@/queries";
import { restoreTrashItems, trashKey } from "@/trash/api";
import { useOpenTrash } from "@/trash/open-trash";
import { RemakeOutdated } from "./projects-remake-review.js";

// The Projects list's selection bar, whose actions appear once a row is ticked, each only when
// it applies to a ticked row: Mark uploaded (a finished video), Mark not uploaded, Move to a
// channel, Make outdated parts again (a project an edit left outdated; it checks the ticked
// projects and opens one scope and cost review first, projects-remake-review.tsx), and Delete
// last. Each is announced in a toast with Undo where it can be taken back.

type Notify = ReturnType<typeof useToast>;

const projectsWord = (count: number): string => counted(count, "project", "projects");

async function refresh(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.projects }),
    client.invalidateQueries({ queryKey: trashKey }),
  ]);
}

// Undo for a delete: the projects come back out of the trash. One that can't says why, with
// Open Trash (`openTrash`) to restore it there.
export async function restoreProjects(
  api: Api,
  client: QueryClient,
  notify: Notify,
  projects: readonly ProjectListing[],
  openTrash: ToastAction,
): Promise<void> {
  try {
    const answer = await restoreTrashItems(
      api,
      projects.map((one) => ({ kind: "project" as const, id: one.id })),
    );
    if (answer.failed.length > 0) {
      const first = answer.failed[0];
      notify(
        `${projectsWord(answer.failed.length)} couldn't be restored: ${first?.reason ?? ""} Restore ${answer.failed.length === 1 ? "it" : "them"} in Settings → Trash.`,
        "error",
        openTrash,
      );
    } else notify(`Restored ${projectsWord(answer.restored.length)}.`, "success");
  } catch (error) {
    notify(
      `The projects weren't restored: ${error instanceof Error ? error.message : String(error)} Restore them in Settings → Trash.`,
      "error",
      openTrash,
    );
  } finally {
    await refresh(client);
  }
}

export function ProjectsBulkBar({
  selection,
  rows,
  scope,
}: {
  readonly selection: Selection<string>;
  // The rows the list draws, in order; Select all covers these.
  readonly rows: readonly ProjectListing[];
  // "Select all 12 shown" when a filter, a search or Show more leaves rows out.
  readonly scope?: string;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const openTrash = useOpenTrash();
  const current = useCurrentChannel();
  const [target, setTarget] = useState("");
  const [confirming, setConfirming] = useState(false);
  const chosen = rows.filter((one) => selection.has(one.id));
  const deletable = chosen.filter((one) => one.status !== "running");
  const ready = chosen.filter(isReadyToUpload);
  const uploaded = chosen.filter((one) => one.uploadedAt !== null);
  // The bundled samples, which Make outdated parts again leaves out.
  const samples = new Set(rows.filter((one) => one.sample === true).map((one) => one.id));
  const outdated = chosen.some((one) => one.outdated === true);

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
          run: () => void restoreProjects(api, client, notify, done, openTrash),
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
    onError: (error: Error) => {
      setTarget("");
      notify(
        `The projects weren't moved: ${error.message} Pick the channel again under Move to channel.`,
        "error",
      );
    },
    onSettled: async () => {
      selection.clear();
      await client.invalidateQueries({ queryKey: keys.projects });
    },
  });

  const busy = remove.isPending || mark.isPending || move.isPending;
  const running = chosen.length - deletable.length;

  return (
    <>
      <SelectionBar
        selection={selection}
        total={rows.length}
        noun={["project", "projects"]}
        // Once a box is ticked the bar stays at the top while the list scrolls, so the bulk
        // actions are in reach from a row far down.
        {...(selection.count === 0
          ? {}
          : { className: "sticky top-0 z-10 border-b border-line bg-ground py-1" })}
        {...(scope === undefined ? {} : { scope })}
        actions={
          <>
            {ready.length === 0 ? null : (
              <Button
                size="small"
                disabled={busy}
                disabledReason="Working on it"
                onClick={() => mark.mutate({ list: ready, on: true })}
              >
                Mark uploaded
              </Button>
            )}
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
            {/* Picking a channel moves them, with Undo in the toast, as a template's Move to…
                does: no Move button drawn greyed until a channel is picked. */}
            {current.channels.length < 2 ? null : (
              <Select
                aria-label="Move the selected projects to a channel"
                className="w-[180px] max-md:w-[168px]"
                value={target}
                disabled={busy}
                onChange={(event) => {
                  const to = event.currentTarget.value;
                  setTarget(to);
                  if (to !== "") move.mutate({ list: chosen, to });
                }}
                options={[
                  { value: "", label: "Move to channel…" },
                  ...current.channels.map((one) => ({ value: one.id, label: one.name })),
                ]}
              />
            )}
            {outdated ? (
              <RemakeOutdated
                chosen={chosen}
                samples={samples}
                busy={busy}
                onDone={selection.clear}
              />
            ) : null}
            {deletable.length === 0 ? null : (
              <Button
                size="small"
                variant="destructive"
                disabled={busy}
                disabledReason="Working on it"
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            )}
          </>
        }
      />
      <ConfirmDialog
        open={confirming}
        title={`Delete ${projectsWord(deletable.length)}?`}
        consequence={`Moves ${deletable.length === 1 ? `"${deletable[0]?.title ?? ""}"` : `these ${String(deletable.length)} projects`} to the trash for 30 days. Undo brings them back, or restore them later in Settings → Trash.${
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useState } from "react";
import { type FilesView, moveFiles, openFilesFolder, readFiles } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Code, Field, Input } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { Meter } from "@/components/kit/stats";
import { useToast } from "@/components/kit/toast";
import { formatBytes } from "./settings-storage";

const filesQueryKey = ["storage-files"] as const;

// Settings → Backup & storage → Your files: where projects, backups and exports are, Open
// folder, and moving them to Documents/Slopify or another folder. A move copies and checks
// every file first and keeps the old folder, so nothing is lost if it stops halfway.
export function FilesFolder({
  usageQueryKey,
}: {
  readonly usageQueryKey: readonly unknown[];
}): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const [choosing, setChoosing] = useState(false);
  const [folder, setFolder] = useState("");
  const [error, setError] = useState<string | undefined>();
  const files = useQuery({
    queryKey: filesQueryKey,
    queryFn: () => readFiles(api),
    refetchInterval: (query) => (moving(query.state.data) ? 1000 : false),
  });
  const move = useMutation({
    mutationFn: (target: string) => moveFiles(api, target),
    onMutate: () => setError(undefined),
    onSuccess: (view) => {
      queryClient.setQueryData(filesQueryKey, view);
      setChoosing(false);
    },
    onError: (caught: Error) => setError(caught.message),
  });
  const open = useMutation({
    mutationFn: () => openFilesFolder(api),
    onSuccess: (result) => {
      if (!result.opened) notify(`Your files are in ${result.path}.`, "info");
    },
    onError: (caught: Error) => notify(caught.message, "error"),
  });

  const view = files.data;
  const running = moving(view);
  const phase = view?.move?.phase;
  // Once a move is done, the storage figures describe the new folder.
  useEffect(() => {
    if (phase === "done") void queryClient.invalidateQueries({ queryKey: usageQueryKey });
  }, [phase, queryClient, usageQueryKey]);

  if (view === undefined)
    return (
      <div>
        <SectionHead
          title="Your files"
          meta={
            files.error
              ? "Where your files are is unavailable. Reload the page to try again."
              : "Loading…"
          }
        />
      </div>
    );

  if (view.docker)
    return (
      <div>
        <SectionHead
          title="Your files"
          meta={view.folder ?? "The Docker project folder isn't set up."}
          info="Projects are in the folder Docker shares with this computer. The container can't move its own folder, so moving it is done by the Slopify installer on the computer running Docker; it waits for running work, copies your projects and checks the copy."
        >
          <Button disabled={view.folder === null || open.isPending} onClick={() => open.mutate()}>
            Open folder
          </Button>
        </SectionHead>
        <div className="flex flex-col gap-2 text-small text-ink-2">
          <FolderLines view={view} />
          {view.dockerCommand === null ? null : (
            <div className="flex flex-col gap-2">
              <p className="m-0">
                To move your projects to Documents/Slopify, run this on the computer running Docker
                (or use <Code>--projects-dir &lt;folder&gt;</Code> for another folder):
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Code className="min-w-0 break-all">{view.dockerCommand}</Code>
                <Button
                  variant="quiet"
                  size="small"
                  onClick={() => {
                    const command = view.dockerCommand ?? "";
                    void navigator.clipboard
                      .writeText(command)
                      .then(() => notify("Command copied.", "success"))
                      .catch(() =>
                        notify(
                          "Copying failed: this browser doesn't allow it here. Select the command and copy it yourself.",
                          "error",
                        ),
                      );
                  }}
                >
                  Copy command
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );

  const resumable = phase === "failed" || phase === "interrupted";
  return (
    <div>
      <SectionHead
        title="Your files"
        meta={view.folder}
        info="Your projects, automatic backups and exports live here. Slopify's database, settings, models and logs stay in its own hidden data folder. Moving copies every file, checks each copy against the original, then switches; the old folder is kept until you delete it. It can't start while a project is being made."
      >
        {view.inDocuments || view.documentsRoot === null ? null : (
          <Button
            variant="primary"
            disabled={running || move.isPending}
            onClick={() => move.mutate("documents")}
          >
            Move to Documents/Slopify
          </Button>
        )}
        <Button disabled={open.isPending} onClick={() => open.mutate()}>
          Open folder
        </Button>
        <Button
          variant="quiet"
          disabled={running || move.isPending}
          onClick={() => {
            setChoosing((now) => !now);
            setError(undefined);
          }}
        >
          Choose another folder
        </Button>
      </SectionHead>
      <div className="flex flex-col gap-3 text-small text-ink-2">
        <FolderLines view={view} />
        {choosing ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              move.mutate(folder);
            }}
          >
            <Field
              label="New folder"
              help="The full path. Slopify makes Projects and Backups inside it; it must be empty or new."
              error={error}
              className="min-w-0 flex-1 basis-80"
            >
              <Input
                value={folder}
                placeholder={view.documentsRoot ?? "/home/you/Videos/Slopify"}
                onChange={(event) => setFolder(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={folder.trim() === "" || move.isPending}>
              Move here
            </Button>
          </form>
        ) : error === undefined ? null : (
          <p role="alert" className="m-0 text-danger">
            {error}
          </p>
        )}
        {view.move === null ? null : running ? (
          <div className="flex flex-col gap-2">
            <p role="status" className="m-0 text-ink tabular-nums">
              {view.move.phase === "copying" ? "Copying" : "Checking the copy of"} your files to{" "}
              {view.move.target}: {view.move.files} of {view.move.totalFiles} files (
              {formatBytes(view.move.bytes)} of {formatBytes(view.move.totalBytes)}). Keep Slopify
              running until it finishes.
            </p>
            <Meter
              label={view.move.phase === "copying" ? "Files copied" : "Files checked"}
              value={view.move.totalBytes === 0 ? 0 : view.move.bytes / view.move.totalBytes}
            />
          </div>
        ) : resumable ? (
          <Callout
            tone={phase === "failed" ? "danger" : "waiting"}
            title={
              phase === "failed"
                ? `Moving your files to ${view.move.target} stopped`
                : `Moving your files to ${view.move.target} didn't finish`
            }
            actions={
              <Button
                disabled={move.isPending}
                onClick={() => move.mutate(view.move?.target ?? "")}
              >
                Continue moving
              </Button>
            }
          >
            {view.move.error ??
              "Slopify was stopped before the copy was checked, so it still uses the old folder. Continue moving picks up where it left off."}
          </Callout>
        ) : phase === "done" && view.move.oldFolder !== null ? (
          <Callout tone="info" title={`Your files are now in ${view.move.target}`}>
            Every file was copied and checked. The old folder {view.move.oldFolder} still has a
            copy; once your projects open fine, you can delete it to free the space.
          </Callout>
        ) : null}
      </div>
    </div>
  );
}

function FolderLines({ view }: { readonly view: FilesView }): ReactElement {
  const lines = [
    ["Projects", view.projects],
    ["Automatic backups", view.backups],
    ["Exports", view.exports],
  ].filter((line): line is [string, string] => line[1] !== null);
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      {lines.map(([label, path]) => (
        <div key={label} className="contents">
          <dt className="text-ink-3">{label}</dt>
          <dd className="m-0 break-all">{path}</dd>
        </div>
      ))}
    </dl>
  );
}

function moving(view: FilesView | undefined): boolean {
  return view?.move?.phase === "copying" || view?.move?.phase === "verifying";
}

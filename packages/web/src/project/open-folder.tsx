import { type FolderReply, folderReplySchema } from "@app/edge/http/folder-location-schema.js";
import { FolderOpen } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { errorOf, problemOf } from "@/http";

import { openRevisionFolder } from "./revision-api.js";

interface Props {
  readonly projectId: string;
  readonly asset: string;
  readonly folder?: { readonly revisionId: string; readonly recordId: string } | null;
}
export function OpenFolder(props: Props): ReactElement {
  return (
    <FolderAction
      key={JSON.stringify([
        props.projectId,
        props.asset,
        props.folder?.revisionId,
        props.folder?.recordId,
      ])}
      {...props}
    />
  );
}
function FolderAction({ projectId, asset, folder = null }: Props) {
  const { api } = useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [path, setPath] = useState<string>();
  async function open(): Promise<void> {
    setPending(true);
    setError(undefined);
    setPath(undefined);
    try {
      let result: FolderReply;
      if (folder) {
        result = await openRevisionFolder(api, projectId, folder.revisionId, folder.recordId);
      } else {
        const response = await api.client.projects[":id"]["open-folder"].$post({
          param: { id: projectId },
          json: { asset },
        });
        if (!response.ok) throw errorOf(response, await problemOf(response));
        result = folderReplySchema.parse(await response.json());
      }
      if (!result.opened) setPath(result.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not locate the folder.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => void open()}
        title="Locate the saved output folder on the machine running Slopify"
        className="inline-flex items-center gap-[5px] rounded-control text-small text-ink2 hover:text-ink disabled:opacity-50"
      >
        <FolderOpen aria-hidden="true" className="size-[14px] shrink-0" />
        {pending ? "Locating…" : path ? "Locate folder" : "Open folder"}
      </button>
      {path !== undefined && (
        <div role="status" className="basis-full min-w-0 text-small text-ink2">
          <p>
            This folder is on the machine running Slopify. Copy the path into a file manager on that
            machine.
          </p>
          <input
            aria-label="Saved folder path"
            readOnly
            value={path}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full min-w-0 rounded-control border border-border bg-transparent p-2 font-mono text-small text-ink"
          />
        </div>
      )}
      {error !== undefined && (
        <span role="alert" className="basis-full text-small text-red">
          {error}
        </span>
      )}
    </>
  );
}

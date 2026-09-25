import { type FolderReply, folderReplySchema } from "@app/edge/http/folder-location-schema.js";
import { FolderOpen } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
      setError(
        cause instanceof Error ? cause.message : "The folder couldn't be opened. Try again.",
      );
    } finally {
      setPending(false);
    }
  }
  const shown = path !== undefined || error !== undefined;
  return (
    <Popover
      open={shown}
      onOpenChange={(open) => {
        if (!open) {
          setPath(undefined);
          setError(undefined);
        }
      }}
    >
      <PopoverAnchor asChild>
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
      </PopoverAnchor>
      <PopoverContent className="space-y-2">
        {path !== undefined ? (
          <div role="status" className="min-w-0 space-y-2 text-small text-ink2">
            <p>
              Slopify runs in Docker, which can't open windows on your desktop. Copy this path into
              your file manager. To have Open folder open it directly, run the Docker launcher again
              (npx @gentbajko/slopify@latest --docker) so it sets up the host helper.
            </p>
            <input
              aria-label="Saved folder path"
              readOnly
              value={path}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full min-w-0 rounded-control border border-line2 bg-transparent p-2 font-mono text-small text-ink"
            />
          </div>
        ) : null}
        {error !== undefined ? (
          <p role="alert" className="text-small text-red">
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

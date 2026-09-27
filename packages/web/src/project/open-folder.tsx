import { type FolderReply, folderReplySchema } from "@app/edge/http/folder-location-schema.js";
import { FolderOpen } from "lucide-react";
import { type ReactElement, useState } from "react";
import type { Api } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/kit/popover";
import { errorOf, problemOf } from "@/http";

import { openRevisionFolder } from "./revision-api.js";

interface Props {
  readonly projectId: string;
  readonly asset: string;
  readonly folder?: { readonly revisionId: string; readonly recordId: string } | null;
  // A real secondary button, never bare text: beside a stage's Download it is full size,
  // inside a row of small file links it is small to match them.
  readonly size?: "default" | "small";
}

// Asks the machine running Slopify to open the folder a saved output is in. When it can't
// (Slopify in Docker without the host helper) the reply carries the path to copy instead.
export async function openFolder(
  api: Api,
  { projectId, asset, folder = null }: Props,
): Promise<FolderReply> {
  if (folder) return openRevisionFolder(api, projectId, folder.revisionId, folder.recordId);
  const response = await api.client.projects[":id"]["open-folder"].$post({
    param: { id: projectId },
    json: { asset },
  });
  if (!response.ok) throw errorOf(response, await problemOf(response));
  return folderReplySchema.parse(await response.json());
}

export const dockerFolderHelp =
  "Slopify runs in Docker, which can't open windows on your desktop. Copy this path into your file manager. To have Open folder open it directly, run the Docker launcher again (npx @gentbajko/slopify@latest --docker) so it sets up the host helper.";

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
function FolderAction(props: Props) {
  const { api } = useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [path, setPath] = useState<string>();
  async function open(): Promise<void> {
    setPending(true);
    setError(undefined);
    setPath(undefined);
    try {
      const result = await openFolder(api, props);
      if (!result.opened) setPath(result.path);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The folder couldn't be opened. Press Open folder to try again.",
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
        <Button
          variant="secondary"
          size={props.size ?? "default"}
          disabled={pending}
          onClick={() => void open()}
          title="Locate the saved output folder on the machine running Slopify"
        >
          <FolderOpen aria-hidden="true" strokeWidth={1.75} />
          {pending ? "Locating…" : path ? "Locate folder" : "Open folder"}
        </Button>
      </PopoverAnchor>
      <PopoverContent className="flex flex-col gap-2">
        {path !== undefined ? (
          <div role="status" className="flex min-w-0 flex-col gap-2 text-small text-ink-2">
            <p className="m-0">{dockerFolderHelp}</p>
            <input
              aria-label="Saved folder path"
              readOnly
              value={path}
              onFocus={(event) => event.currentTarget.select()}
              className="sl-input w-full min-w-0 font-mono text-small"
            />
          </div>
        ) : null}
        {error !== undefined ? (
          <p role="alert" className="m-0 text-small text-danger">
            {error}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

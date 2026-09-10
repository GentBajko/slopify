import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/app-context";
import { errorOf, problemOf } from "@/http";

export function OpenFolder({
  projectId,
  asset,
}: {
  readonly projectId: string;
  readonly asset: string;
}) {
  const { api } = useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function open(): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      const response = await api.client.projects[":id"]["open-folder"].$post({
        param: { id: projectId },
        json: { asset },
      });
      if (!response.ok) throw errorOf(response, await problemOf(response));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the folder.");
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
        title="Open the saved output folder on the machine running Slopify"
        className="inline-flex items-center gap-[5px] rounded-control text-small text-ink2 hover:text-ink disabled:opacity-50"
      >
        <FolderOpen aria-hidden="true" className="size-[14px] shrink-0" />
        {pending ? "Opening…" : "Open folder"}
      </button>
      {error !== undefined && (
        <span role="alert" className="basis-full text-small text-red">
          {error}
        </span>
      )}
    </>
  );
}

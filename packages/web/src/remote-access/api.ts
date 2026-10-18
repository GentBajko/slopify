import type { RemoteAccessView } from "@app/edge/remote-access/model.js";
import type { Api } from "@/api";
import { read } from "@/http";

// Settings → General → Remote access (`edge/http/remote-access.ts`). A problem is part of the
// view, with its own sentences; a refusal is the server's sentence.

export type { RemoteAccessView };

export const remoteAccessKey = ["settings", "remote-access"] as const;

const url = (api: Api) => `${api.origin}/api/settings/remote-access`;

export async function readRemoteAccess(api: Api): Promise<RemoteAccessView> {
  return read<RemoteAccessView>(await api.fetch(url(api)));
}

export async function setRemoteAccess(
  api: Api,
  change: { readonly enabled: boolean; readonly httpsPort?: number },
): Promise<RemoteAccessView> {
  return read<RemoteAccessView>(
    await api.fetch(url(api), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(change),
    }),
  );
}

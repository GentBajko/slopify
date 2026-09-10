import type { UpdateInfo } from "@app/updater/model.js";
import type { Api } from "@/api";
import { read } from "@/http";

export type { UpdateInfo };

export const updateKey = ["app-update"] as const;
export const updateCheckInterval = 15 * 60 * 1000;
export const updateReconnectInterval = 2_000;

export async function checkUpdate(
  api: Api,
  refresh = false,
  signal?: AbortSignal,
): Promise<UpdateInfo> {
  const timeout = AbortSignal.timeout(20_000);
  return read<UpdateInfo>(
    await api.fetch(`${api.origin}/api/update${refresh ? "?refresh=1" : ""}`, {
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
      cache: "no-store",
    }),
  );
}

export async function installUpdate(api: Api): Promise<UpdateInfo> {
  return read<UpdateInfo>(
    await api.fetch(`${api.origin}/api/update`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    }),
  );
}

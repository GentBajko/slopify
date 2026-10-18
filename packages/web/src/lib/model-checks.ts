import type { AutoMode, ModelKey } from "@app/slices/model-checks/model.js";
import type { ChecksOverview } from "@app/slices/model-checks/service.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { read } from "@/http";

// What Check models would check and cost, as GET /providers/:id/models/check/estimate says.
export interface CheckEstimate {
  readonly provider: string;
  readonly count: number;
  readonly totalDollars: number;
  readonly unpriced: number;
  readonly planAccounts: readonly string[];
  readonly text: string;
  readonly skipped: readonly { readonly model: string; readonly reason: string }[];
}

export const modelChecksKey = ["model-checks"] as const;

export function modelChecksQuery(api: Api) {
  return queryOptions({
    queryKey: modelChecksKey,
    queryFn: async ({ signal }) =>
      read<ChecksOverview>(await api.fetch(`${api.origin}/api/model-checks`, { signal })),
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
    retry: false,
  });
}

const checkPath = (api: Api, provider: string): string =>
  `${api.origin}/api/providers/${encodeURIComponent(provider)}/models/check`;

export async function estimateChecks(
  api: Api,
  provider: string,
  models?: readonly string[],
): Promise<CheckEstimate> {
  const query = models === undefined ? "" : `?models=${encodeURIComponent(models.join(","))}`;
  return read<CheckEstimate>(await api.fetch(`${checkPath(api, provider)}/estimate${query}`));
}

export async function startChecks(
  api: Api,
  provider: string,
  models: readonly string[] | undefined,
  confirmedDollars: number | undefined,
): Promise<CheckEstimate> {
  return read<CheckEstimate>(
    await api.fetch(checkPath(api, provider), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(models === undefined ? {} : { models }),
        ...(confirmedDollars === undefined ? {} : { confirmedDollars }),
      }),
    }),
  );
}

export async function dismissNotices(api: Api, keys: readonly ModelKey[]): Promise<void> {
  const response = await api.fetch(`${api.origin}/api/model-checks/notices/dismiss`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  if (!response.ok) await read(response);
}

export async function setAutoChecks(api: Api, auto: AutoMode): Promise<void> {
  await read(
    await api.fetch(`${api.origin}/api/model-checks/auto`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auto }),
    }),
  );
}

// Whether the person has to see the price before the checks go out.
export function costsMoney(estimate: CheckEstimate): boolean {
  return estimate.totalDollars > 0 || estimate.unpriced > 0;
}

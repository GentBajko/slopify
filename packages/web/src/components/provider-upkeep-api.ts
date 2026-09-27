import type { CatalogueSyncStatus } from "@app/catalog/store.js";
import type { RetiredUsage } from "@app/slices/model-upkeep/model.js";
import type { FirstRunStatus } from "@app/slices/settings/first-run.js";
import type { HealthReport } from "@app/slices/settings/health.js";
import type { KeyTestOutcome } from "@app/slices/settings/key-test.js";
import type { ProviderId } from "@app/slices/settings/model.js";
import type { Api } from "@/api";
import { read } from "@/http";

// Settings → Providers' Test and Check all, Settings → Models' automatic check and retired
// models, and the first-run welcome. Plain requests: none of these routes carries a key.
export const upkeepKeys = {
  catalogue: ["catalogue"] as const,
  retired: ["catalogue", "retired"] as const,
  firstRun: ["first-run"] as const,
};

export interface CatalogueStatus {
  readonly updatedAt?: string;
  readonly path?: string;
  readonly warning: string | null;
  readonly sync?: CatalogueSyncStatus;
}

const post = { method: "POST" } as const;

export async function testKey(api: Api, provider: ProviderId): Promise<KeyTestOutcome> {
  return read<KeyTestOutcome>(
    await api.fetch(`${api.origin}/api/providers/${provider}/key/test`, post),
  );
}
// Every provider, or `provider` alone (its own Check again button).
export async function checkHealth(api: Api, provider?: ProviderId): Promise<HealthReport> {
  const query = provider === undefined ? "" : `?provider=${encodeURIComponent(provider)}`;
  return read<HealthReport>(await api.fetch(`${api.origin}/api/providers/health${query}`, post));
}
export async function readCatalogue(api: Api): Promise<CatalogueStatus> {
  return read<CatalogueStatus>(await api.fetch(`${api.origin}/api/providers/catalogue`));
}
export async function checkCatalogue(api: Api): Promise<CatalogueStatus> {
  return read<CatalogueStatus>(
    await api.fetch(`${api.origin}/api/providers/catalogue/check`, post),
  );
}
export async function refreshCatalogue(api: Api): Promise<CatalogueStatus> {
  return read<CatalogueStatus>(
    await api.fetch(`${api.origin}/api/providers/catalogue/refresh`, post),
  );
}
export async function readRetired(api: Api): Promise<readonly RetiredUsage[]> {
  return (
    await read<{ readonly usages: readonly RetiredUsage[] }>(
      await api.fetch(`${api.origin}/api/providers/catalogue/retired`),
    )
  ).usages;
}
export async function switchRetired(api: Api, usage: RetiredUsage): Promise<void> {
  await read<unknown>(
    await api.fetch(`${api.origin}/api/providers/catalogue/retired/switch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: usage.kind,
        id: usage.id,
        slot: usage.slot,
        from: { provider: usage.provider, model: usage.model },
        to: usage.replacement?.id ?? "",
      }),
    }),
  );
}
export async function switchAllRetired(api: Api): Promise<{
  readonly switched: number;
  readonly failed: readonly { readonly message: string }[];
}> {
  return read(await api.fetch(`${api.origin}/api/providers/catalogue/retired/switch-all`, post));
}
export async function readFirstRun(api: Api): Promise<FirstRunStatus> {
  return read<FirstRunStatus>(await api.fetch(`${api.origin}/api/providers/first-run`));
}
export async function dismissWelcome(api: Api): Promise<void> {
  const response = await api.fetch(`${api.origin}/api/providers/first-run/dismiss`, post);
  if (!response.ok) await read<unknown>(response);
}

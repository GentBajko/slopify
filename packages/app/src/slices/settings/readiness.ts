import type { DatabaseSync } from "node:sqlite";
import { cliPathStatus } from "./cli-paths.js";
import type { CliProbe } from "./cli-status.js";
import { cliReadiness } from "./cli-status.js";
import type { ProviderId, ProviderStatus, Readiness } from "./model.js";
import { providers } from "./model.js";
import { keyedProviders } from "./repo.js";

export interface ReadinessDeps {
  readonly db: DatabaseSync;
  readonly probe: CliProbe;
}

// Every supported provider is listed, keyed or not, found or not, so Play can grey one out with
// a reason instead of hiding it. A keyed provider is ready when a key is stored; a CLI provider
// when its binary answers. Readiness is computed per request using the latest saved executable override.
export async function providerStatuses(deps: ReadinessDeps): Promise<readonly ProviderStatus[]> {
  const keyed = keyedProviders(deps.db);
  return await Promise.all(
    providers.map(async (provider): Promise<ProviderStatus> => {
      const base = { id: provider.id, family: provider.family, displayName: provider.displayName };
      if (provider.auth !== "cli")
        return { ...base, readiness: keyedReadiness(keyed, provider.id) };
      const cliPath = cliPathStatus(deps.db, provider.id);
      return {
        ...base,
        cliPath,
        readiness: await cliReadiness(deps.probe, { ...provider, binary: cliPath.command }),
      };
    }),
  );
}

function keyedReadiness(keyed: ReadonlySet<ProviderId>, id: ProviderId): Readiness {
  return { kind: "keyed", hasKey: keyed.has(id) };
}

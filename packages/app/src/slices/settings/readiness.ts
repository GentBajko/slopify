import type { DatabaseSync } from "node:sqlite";
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
// when its binary answers. Readiness is computed per request and nothing about a CLI is stored.
export async function providerStatuses(deps: ReadinessDeps): Promise<readonly ProviderStatus[]> {
  const keyed = keyedProviders(deps.db);
  return await Promise.all(
    providers.map(async (provider) => ({
      id: provider.id,
      family: provider.family,
      displayName: provider.displayName,
      readiness:
        provider.auth === "cli"
          ? await cliReadiness(deps.probe, provider)
          : keyedReadiness(keyed, provider.id),
    })),
  );
}

function keyedReadiness(keyed: ReadonlySet<ProviderId>, id: ProviderId): Readiness {
  return { kind: "keyed", hasKey: keyed.has(id) };
}

import type { DatabaseSync } from "node:sqlite";
import { cliPathStatus } from "./cli-paths.js";
import type { CliProbe, CliProbeResult } from "./cli-status.js";
import { cliProbeTimeoutMs, readinessFromProbe } from "./cli-status.js";
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
  const probes = new Map<string, Promise<CliProbeResult>>();
  return await Promise.all(
    providers.map(async (provider): Promise<ProviderStatus> => {
      const base = { id: provider.id, family: provider.family, displayName: provider.displayName };
      if (provider.auth !== "cli")
        return { ...base, readiness: keyedReadiness(keyed, provider.id) };
      const cliPath = cliPathStatus(deps.db, provider.id);
      const probeKey = JSON.stringify([cliPath.command, provider.versionArgs]);
      let result = probes.get(probeKey);
      if (result === undefined) {
        result = deps.probe(cliPath.command, provider.versionArgs, cliProbeTimeoutMs);
        probes.set(probeKey, result);
      }
      return {
        ...base,
        cliPath,
        readiness: readinessFromProbe(await result, provider),
      };
    }),
  );
}

function keyedReadiness(keyed: ReadonlySet<ProviderId>, id: ProviderId): Readiness {
  return { kind: "keyed", hasKey: keyed.has(id) };
}

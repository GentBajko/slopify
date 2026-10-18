import { errorText } from "../../kernel/errors.js";
import { readFontFile } from "../fonts/files.js";
import type { ResolvedFont } from "../fonts/model.js";
import type { ProviderStatus } from "../settings/model.js";
import type { CheckContext } from "./gate.js";

// The fonts and providers Mark ready looks at, read from this computer. `main.ts` passes the
// real font catalogue and provider statuses; tests pass their own.

export function designCheckContext(deps: {
  readonly resolveFont: (fontId: string) => Promise<ResolvedFont>;
  readonly providers: () => Promise<readonly ProviderStatus[]>;
}): CheckContext {
  return {
    font: async (fontId) => {
      try {
        const font = await deps.resolveFont(fontId);
        const bytes = await readFontFile(font.path);
        return bytes === undefined
          ? undefined
          : { name: font.name, bytes: new Uint8Array(bytes), faceIndex: font.faceIndex };
      } catch {
        return undefined;
      }
    },
    providerProblem: async (provider) => {
      let statuses: readonly ProviderStatus[];
      try {
        statuses = await deps.providers();
      } catch (error) {
        return `Slopify couldn't check the image provider: ${errorText(error)} Open Settings → Providers, then press Mark ready again.`;
      }
      const status = statuses.find((one) => one.id === provider);
      if (status === undefined)
        return `The image provider “${provider}” isn't one this Slopify knows. Choose another image model under Picture.`;
      const readiness = status.readiness;
      if (readiness.kind === "keyed" && !readiness.hasKey)
        return `${status.displayName} has no API key, so the picture can't be made. Add the key in Settings → Providers, then press Mark ready again.`;
      if (readiness.kind === "cli" && (!readiness.installed || readiness.issue !== undefined))
        return `${status.displayName} can't be used yet: ${readiness.issue ?? "it isn't installed on this computer."} Fix it in Settings → Providers, then press Mark ready again.`;
      return null;
    },
  };
}

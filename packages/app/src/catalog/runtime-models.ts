import type { ThinkingMode } from "../kernel/ports/llm.js";
import type { ModelInfo, ProviderFamily } from "../kernel/ports/model.js";
import { isLocalCliProvider } from "../slices/settings/model.js";

export type RuntimeModelResult = "available" | "manual" | "missing" | "thinking";

export async function checkRuntimeModel(
  modelsFor: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>,
  provider: string,
  family: ProviderFamily,
  id: string,
  thinking?: ThinkingMode,
): Promise<RuntimeModelResult> {
  if (id.trim() === "") return "missing";
  try {
    const model = (await modelsFor(provider, family)).find((row) => row.id === id);
    if (model === undefined) return "missing";
    if (family === "llm" && thinking !== undefined && !model.thinkingModes?.includes(thinking))
      return "thinking";
    return "available";
  } catch {
    return isLocalCliProvider(provider) && family === "llm" ? "manual" : "missing";
  }
}

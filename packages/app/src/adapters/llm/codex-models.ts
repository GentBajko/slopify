import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { readCatalogueFile } from "./catalogue-files.js";

const safeText = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((text) =>
    [...text].every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    ),
  );
// Deliberately omit model instructions, capabilities and every authentication
// file. Visibility refers to the CLI picker, not supported_in_api: some visible
// CLI-only models cannot be called through the public API.
const cache = z.object({ models: z.array(z.unknown()).max(1000) });
const model = z.object({
  slug: safeText.refine((id) => !/\s/.test(id)),
  display_name: safeText.optional(),
  visibility: z.literal("list"),
  priority: z.number().finite().optional(),
});

export async function nodeCodexModels(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<readonly ModelInfo[]> {
  try {
    const directory = env.CODEX_HOME?.trim() || join(homedir(), ".codex");
    const source = await readCatalogueFile(join(directory, "models_cache.json"), 8 * 1024 * 1024);
    const parsed = cache.parse(JSON.parse(source));
    const models = parsed.models
      .flatMap((entry) => {
        const parsed = model.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      })
      .sort((left, right) => (left.priority ?? Infinity) - (right.priority ?? Infinity));
    const unique = new Map<string, ModelInfo>();
    for (const item of models) {
      if (!unique.has(item.slug)) {
        unique.set(item.slug, { id: item.slug, name: item.display_name ?? item.slug });
      }
    }
    if (unique.size === 0) throw new Error("No visible models");
    return [...unique.values()];
  } catch {
    // Do not expose cache contents, home paths or raw JSON errors to the browser.
    throw new Error(
      "Codex model metadata is unavailable. Open Codex once to refresh its model list, or enter a custom model ID.",
    );
  }
}

import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { cliCommand } from "../../kernel/cli-command.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { readCatalogueFile } from "./catalogue-files.js";

export async function nodeGeminiModels(binary: string): Promise<readonly ModelInfo[]> {
  try {
    const command = cliCommand(binary);
    const entry = await executablePath(command.args[0] ?? command.file);
    const candidates = new Set<string>();
    let directory = dirname(entry);
    // npm and bun can install the core package nested under gemini-cli or
    // hoisted beside it. Resolve the configured executable's symlinks first.
    for (let depth = 0; depth < 10; depth += 1) {
      const suffix = "gemini-cli-core/dist/src/config/models.js";
      candidates.add(join(directory, "node_modules/@google", suffix));
      candidates.add(join(directory, suffix));
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    for (const candidate of candidates) {
      try {
        const models = parseGeminiModels(await readCatalogueFile(candidate, 256 * 1024));
        if (models.length > 1) return models;
      } catch {
        // A candidate is an optional package layout, not the final discovery result.
      }
    }
    // Recent Gemini CLI releases ship only bundled chunks. Follow the entry
    // point's literal chunk imports and read their model constants as text.
    const bundled = await bundledModels(entry);
    if (bundled.length > 1) return bundled;
    throw new Error("No installed model metadata");
  } catch {
    throw new Error(
      "Gemini CLI model metadata is unavailable. Use a documented CLI alias or enter a custom model ID.",
    );
  }
}

async function bundledModels(entry: string): Promise<readonly ModelInfo[]> {
  const source = await readCatalogueFile(entry, 256 * 1024);
  const imports = new Set<string>();
  for (const match of source.matchAll(
    /\b(?:from\s+|import\s*)["']\.\/(chunk-[A-Za-z0-9-]+\.js)["']/g,
  )) {
    if (match[1] !== undefined) imports.add(match[1]);
  }
  if (imports.size === 0 || imports.size > 32) return [];
  for (const name of imports) {
    try {
      const source = await readCatalogueFile(join(dirname(entry), name), 24 * 1024 * 1024);
      if (!source.includes("packages/core/dist/src/config/models.js")) continue;
      const models = parseGeminiModels(source);
      if (models.length > 1) return models;
    } catch {
      // Other chunks can be absent or too large; do not execute them.
    }
  }
  return [];
}

function parseGeminiModels(source: string): readonly ModelInfo[] {
  const models = new Map<string, ModelInfo>();
  // Read literal model constants only. Never import or execute an
  // installed package, parse comments as entries, or inspect login/settings.
  const declarations =
    /^(?:export\s+)?(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"])([^'"\r\n]+)\2\s*;/gm;
  const uncommented = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of uncommented.matchAll(declarations)) {
    const name = match[1];
    const id = match[3];
    if (
      name === undefined ||
      id === undefined ||
      !name.includes("MODEL") ||
      name.includes("EMBEDDING") ||
      !/^gemini-\d+(?:\.\d+)?-(?:pro|flash|flash-lite)(?:-preview(?:-\d{2}-\d{2})?)?$/.test(id)
    )
      continue;
    // SECONDARY and CUSTOM_TOOLS constants are routing aliases, not separate
    // picker choices. Gemma and embedding models use different availability rules.
    // In 0.61+, DEFAULT_FLASH points at a BASE constant while new releases
    // use LATEST constants. Read both literal sources without evaluating JS.
    if (!/^(?:PREVIEW|DEFAULT|BASE|LATEST)_GEMINI_/.test(name) || name.includes("CUSTOM_TOOLS"))
      continue;
    const parts = /^gemini-(\d+(?:\.\d+)?)-(pro|flash-lite|flash)/.exec(id);
    if (!parts) continue;
    const tier = parts[2] === "pro" ? "Pro" : parts[2] === "flash-lite" ? "Flash-Lite" : "Flash";
    models.set(id, {
      id,
      name: `Gemini ${parts[1]} ${tier}${id.includes("-preview") ? " (Preview)" : ""}`,
    });
  }
  if (models.size === 0) return [];
  const sorted = [...models.values()].sort((a, b) =>
    b.id.localeCompare(a.id, "en", { numeric: true }),
  );
  const tiers = new Set<string>();
  const choices = sorted.map((model) => {
    const tier = /-(pro|flash-lite|flash)(?:-|$)/.exec(model.id)?.[1] ?? model.id;
    const group = tiers.has(tier) ? "Other versions" : "Latest in installed CLI";
    tiers.add(tier);
    return { ...model, group };
  });
  return [{ id: "auto", name: "Automatic (CLI default)" }, ...choices];
}

async function executablePath(binary: string): Promise<string> {
  if (isAbsolute(binary) || /[\\/]/.test(binary)) return realpath(binary);
  const path = Object.entries(process.env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
  for (const directory of path.split(delimiter).slice(0, 128)) {
    if (directory === "") continue;
    const candidate = join(directory.replace(/^"|"$/g, ""), binary);
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Continue normal PATH lookup; no process is launched for discovery.
    }
  }
  throw new Error("Gemini executable was not found");
}

import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { cliCommand } from "../../kernel/cli-command.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { readCatalogueFile } from "./catalogue-files.js";

// Official CLI aliases follow the installed CLI's model routing and account.
// https://geminicli.com/docs/cli/model/
export const geminiModels: readonly ModelInfo[] = [
  { id: "auto", name: "Gemini Auto (CLI default)" },
  { id: "pro", name: "Gemini Pro (CLI alias)" },
  { id: "flash", name: "Gemini Flash (CLI alias)" },
  { id: "flash-lite", name: "Gemini Flash-Lite (CLI alias)" },
];

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
        if (models.length > geminiModels.length) return models;
      } catch {
        // A candidate is an optional package layout, not the final discovery result.
      }
    }
    throw new Error("No installed model metadata");
  } catch {
    throw new Error(
      "Gemini CLI model metadata is unavailable. Use a documented CLI alias or enter a custom model ID.",
    );
  }
}

function parseGeminiModels(source: string): readonly ModelInfo[] {
  const models = new Map(geminiModels.map((model) => [model.id, model]));
  // Read literal exported model constants only. Never import or execute an
  // installed package, parse comments as entries, or inspect login/settings.
  const declarations = /^export (?:const|let) ([A-Z][A-Z0-9_]*)\s*=\s*(['"])([^'"\r\n]+)\2\s*;/gm;
  const uncommented = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of uncommented.matchAll(declarations)) {
    const name = match[1];
    const id = match[3];
    if (
      name === undefined ||
      id === undefined ||
      !name.includes("MODEL") ||
      name.includes("EMBEDDING") ||
      !/^(?:gemini|gemma)-[a-z0-9.-]+$/.test(id)
    )
      continue;
    if (!/^(?:(?:PREVIEW|DEFAULT|SECONDARY)_GEMINI_|GEMMA_)/.test(name)) continue;
    models.set(id, { id, name: id });
  }
  return [...models.values()];
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

import { execFile } from "node:child_process";
import { cliCommand } from "../../kernel/cli-command.js";
import type { ModelInfo } from "../../kernel/ports/model.js";

export type ReadCliOutput = (file: string, args: readonly string[]) => Promise<string>;

// `agy models` prints one model per line: its slug, spaces, then its display name
// (antigravity.google/docs/cli/headless.md). Lines that are not a slug are skipped.
export function parseAntigravityModels(text: string): readonly ModelInfo[] {
  const models = new Map<string, ModelInfo>();
  for (const line of text.split(/\r?\n/).slice(0, 1000)) {
    const match = /^\s*([a-z0-9][a-z0-9._-]{1,127})\s{2,}(\S.{0,255}?)\s*$/.exec(line);
    if (match?.[1] === undefined || match[2] === undefined || models.has(match[1])) continue;
    models.set(match[1], { id: match[1], name: match[2] });
  }
  return [...models.values()];
}

function nodeReadCliOutput(file: string, args: readonly string[]): Promise<string> {
  const command = cliCommand(file);
  return new Promise((resolve, reject) => {
    execFile(
      command.file,
      [...command.args, ...args],
      {
        timeout: 15_000,
        maxBuffer: 256 * 1024,
        windowsHide: true,
        env: { ...process.env, AGY_CLI_DISABLE_AUTO_UPDATE: "true" },
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

export async function nodeAntigravityModels(
  binary: string,
  read: ReadCliOutput = nodeReadCliOutput,
): Promise<readonly ModelInfo[]> {
  try {
    const models = parseAntigravityModels(await read(binary, ["models"]));
    if (models.length === 0) throw new Error("No models listed");
    return models;
  } catch {
    // Do not pass the CLI's raw output or home paths to the browser.
    throw new Error(
      'Slopify could not get the model list from the Antigravity CLI (it ran "agy models"). Check agy is installed and signed in (Settings → Providers), then refresh the list, or type a model slug that "agy models" shows.',
    );
  }
}

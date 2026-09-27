import { access, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { readState } from "../docker-install/state.js";
import { isWsl } from "../open-browser.js";
import { containerLoginStart, type LoginStart, loginStartSchema } from "./docker.js";
import { createNativeAutostart, nodeAutostartExec, nodeAutostartFs } from "./native.js";
import { type AutostartService, createAutostartService } from "./service.js";

export interface AutostartContext {
  readonly db: DatabaseSync;
  readonly dataDir: string;
  readonly logs: string;
  readonly port: number;
  readonly host: string;
  readonly version: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
}

/** The switch for this process: the container's report in Docker, the login entry otherwise. */
export async function createAutostart(context: AutostartContext): Promise<AutostartService> {
  if (context.env.SLOPIFY_CONTAINER === "1")
    return createAutostartService(context.db, {
      kind: "docker",
      record: () =>
        context.env.SLOPIFY_DOCKER_INSTALL_STATE === undefined
          ? Promise.resolve(null)
          : readLoginStart(containerLoginStart),
    });
  return createAutostartService(context.db, {
    kind: "native",
    native: createNativeAutostart({
      platform: process.platform,
      home: homedir(),
      env: context.env,
      wsl: isWsl(process.platform, context.env),
      fs: nodeAutostartFs,
      exec: nodeAutostartExec,
      node: process.execPath,
      entry: await stableEntry(),
      npxCli: await npxCli(),
      version: context.version,
      dataDir: context.dataDir,
      port: context.port,
      host: context.host,
      log: join(context.logs, "autostart.log"),
    }),
  });
}

export async function readLoginStart(path: string): Promise<LoginStart | null> {
  try {
    return await readState(path, loginStartSchema, process.getuid?.() ?? -1);
  } catch {
    // Damaged, or not the installer's: the same as not knowing.
    return null;
  }
}

// This package's cli.js, unless it lives in the npx cache, which npx may clean at any time.
async function stableEntry(): Promise<string | null> {
  const entry = fileURLToPath(new URL("../cli.js", import.meta.url));
  try {
    await access(entry);
    const real = await realpath(entry);
    return real.includes(`${sep}_npx${sep}`) ? null : real;
  } catch {
    // Running from source (tsx): there is no built entry to start.
    return null;
  }
}

// npm's npx script beside this Node (the Windows and the Unix installation layouts).
async function npxCli(): Promise<string | null> {
  const nodeDir = dirname(process.execPath);
  for (const candidate of [
    join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js"),
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ]) {
    try {
      await access(candidate);
      // Not resolved: Homebrew's links stay put while the folders they point to change.
      return candidate;
    } catch {
      // Try the next layout.
    }
  }
  return null;
}

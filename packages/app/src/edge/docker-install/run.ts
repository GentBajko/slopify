import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { nodeHostSetupRunner } from "../../host-cli/install.js";
import { readVersion } from "../../kernel/version.js";
import { recordLoginStart } from "../autostart/docker-record.js";
import { nodeAutostartExec } from "../autostart/native.js";
import { askTerminal } from "../autostart/prompt.js";
import { assertManagedDockerHost, planDockerHostCli } from "../docker.js";
import { applyDocker } from "./apply.js";
import { dockerEngine } from "./engine.js";
import { absolute, dockerRoot, identifier } from "./state.js";

export interface DockerCommand {
  readonly mode: "install" | "update";
  readonly port?: string;
  readonly projectsDir?: string;
  readonly hostCli?: string;
  readonly acceptHostCli?: boolean;
  // --autostart / --no-autostart; undefined asks on an interactive terminal.
  readonly autostart?: boolean;
}

/** `slopify --docker`, `slopify install --docker` and `slopify update --docker`. */
export async function runDockerCommand(command: DockerCommand): Promise<void> {
  const env = process.env;
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  assertManagedDockerHost(process.platform, uid, gid);
  const home = homedir();
  const version = readVersion();
  const portText = command.port ?? env.SLOPIFY_DOCKER_HOST_PORT;
  if (
    portText !== undefined &&
    portText !== "" &&
    (!/^\d{1,5}$/.test(portText) || Number(portText) > 65535)
  )
    throw new Error(
      `Invalid port ${JSON.stringify(portText)}: use a whole number between 1 and 65535, for example --port 7070.`,
    );
  const projectsText = command.projectsDir ?? env.SLOPIFY_DOCKER_PROJECTS_DIR;
  const name = identifier.safeParse(env.SLOPIFY_DOCKER_NAME || "slopify");
  const volume = identifier.safeParse(env.SLOPIFY_DOCKER_VOLUME || "slopify-data");
  if (!name.success || !volume.success)
    throw new Error(
      "SLOPIFY_DOCKER_NAME and SLOPIFY_DOCKER_VOLUME may only use letters, digits, dots, dashes and underscores, and must start with a letter or digit. Fix them and try again.",
    );
  const projects = projectsText
    ? resolve(projectsText.startsWith("~/") ? join(home, projectsText.slice(2)) : projectsText)
    : null;
  if (projects !== null && !absolute.safeParse(projects).success)
    throw new Error(
      `The project folder ${JSON.stringify(projectsText)} can't be used: give a full path without commas, for example --projects-dir ~/Slopify/Projects.`,
    );
  const controller = new AbortController();
  const abort = () =>
    controller.abort(
      new Error(
        "Stopped before it finished. Run the same command again; Slopify puts the previous version back first if anything was half done.",
      ),
    );
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const hostCli = await planDockerHostCli({
      root: join(env.XDG_DATA_HOME || join(home, ".local/share"), "slopify/host-cli"),
      version,
      disabled: command.hostCli === "off",
      accepted: command.acceptHostCli === true,
      interactive: process.stdin.isTTY === true,
      env,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20 * 60_000)]),
      runner: nodeHostSetupRunner,
      prompt: async (message) => {
        const terminal = createInterface({ input: process.stdin, output: process.stdout });
        try {
          return /^(?:y|yes)$/i.test((await terminal.question(message)).trim());
        } finally {
          terminal.close();
        }
      },
    });
    const result = await applyDocker(
      {
        home,
        uid,
        gid: gid as number,
        root: dockerRoot(env, home),
        name: name.data,
        volume: volume.data,
        image: env.SLOPIFY_DOCKER_IMAGE || `ghcr.io/gentbajko/slopify:${version}`,
        version,
        port: portText === undefined ? null : portText === "" ? 0 : Number(portText),
        projects,
        mode: command.mode,
        composeFile: await composeFile(),
        hostCli,
        report: (line) => console.log(line),
      },
      dockerEngine(nodeHostSetupRunner, controller.signal, env),
    );
    console.log(
      result.changed
        ? `Slopify ${version} is running at ${result.url}`
        : `Slopify ${version} is already installed and running at ${result.url}`,
    );
    console.log(`Project files on this machine: ${result.projects}`);
    console.log(
      hostCli.enabled
        ? "Host CLI bridge ready: Claude Code, Codex and Gemini run on this machine with their existing logins."
        : command.hostCli === "off"
          ? "Using API keys only (--host-cli=off). Leave that option out to use the Claude Code, Codex or Gemini CLI installed on this machine."
          : "Using API keys only. Install Claude Code, Codex or Gemini on this machine and run the command again to use them.",
    );
    if (result.recovery)
      console.log(`Recovery copy of your data: Docker volume ${result.recovery}`);
    for (const line of result.removed) console.log(`Removed ${line}.`);
    for (const problem of result.problems) console.warn(problem);
    await recordLoginStart({
      directory: join(dockerRoot(env, home), name.data),
      name: name.data,
      uid,
      flag: command.autostart,
      interactive: process.stdin.isTTY === true,
      ask: askTerminal,
      exec: nodeAutostartExec,
      now: () => new Date(),
      report: (line) => console.log(line),
    }).catch((error: unknown) => {
      console.warn(
        `Slopify couldn't check whether Docker starts when you log in (${error instanceof Error ? error.message : String(error)}). Settings → General will say it doesn't know; run the command again to check again.`,
      );
    });
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}

// dist/compose.yaml in the package; the repository's own compose.yaml when run from source.
async function composeFile(): Promise<string> {
  const candidates = ["../../compose.yaml", "../../../../../compose.yaml"].map((path) =>
    fileURLToPath(new URL(path, import.meta.url)),
  );
  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next location.
    }
  }
  throw new Error(
    "This Slopify package is missing its compose.yaml. Reinstall it (npx @gentbajko/slopify@latest --docker) and try again.",
  );
}

/** Whether this user has a Docker installation, so `slopify update` knows which one to update. */
export async function hasDockerInstall(env: Readonly<NodeJS.ProcessEnv>): Promise<boolean> {
  const directory = join(dockerRoot(env, homedir()), env.SLOPIFY_DOCKER_NAME || "slopify");
  for (const file of ["install.json", "receipt.json"]) {
    try {
      await access(join(directory, file));
      return true;
    } catch {
      // Not this one.
    }
  }
  return false;
}

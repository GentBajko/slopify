#!/usr/bin/env node
import { type Config, configFrom } from "../kernel/config/index.js";
import { readVersion } from "../kernel/version.js";
import { boot } from "../main.js";
import { forwardManagedUpdate } from "../updater/forward.js";
import { askTerminal, autostartFlag, settleAutostart } from "./autostart/prompt.js";
import { helpText, parseCli } from "./cli-args.js";
import { openBrowser } from "./open-browser.js";
import { installSignalShutdown } from "./signal-shutdown.js";

let config: Config | undefined;
try {
  const parsed = parseCli(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(helpText(readVersion()));
    process.exit(0);
  }
  if (parsed.kind === "version") {
    console.log(readVersion());
    process.exit(0);
  }
  const { values, positionals } = parsed;
  const autostart = autostartFlag(values);
  const [action, ...extra] = positionals;
  if (extra.length > 0 || (action !== undefined && action !== "install" && action !== "update"))
    throw new Error(
      `Unknown command "${positionals.join(" ")}". Use npx @gentbajko/slopify to start Slopify, npx @gentbajko/slopify --docker to install it in Docker, or npx @gentbajko/slopify@latest update to update it.`,
    );
  if (action === "install" && !values.docker)
    throw new Error(
      "Without Docker there is nothing to install: npx @gentbajko/slopify starts Slopify directly. To install it in Docker, run npx @gentbajko/slopify install --docker.",
    );
  // `update` goes to the Docker installation when this user has one.
  const docker =
    values.docker === true ||
    (action === "update" &&
      (await (await import("./docker-install/run.js")).hasDockerInstall(process.env)));
  if (values["projects-dir"] !== undefined && !docker)
    throw new Error(
      "--projects-dir only works together with --docker. Without Docker, choose where Slopify keeps its files with --data-dir <folder>.",
    );
  if ((values["host-cli"] !== undefined || values["accept-host-cli"] !== undefined) && !docker)
    throw new Error(
      "--host-cli and --accept-host-cli only work together with --docker. Add --docker, or remove those options.",
    );
  if (values["host-cli"] !== undefined && values["host-cli"] !== "off")
    throw new Error(
      `--host-cli=${values["host-cli"]} is not supported. The only value is --host-cli=off, which installs Docker using API keys only; leave the option out to use the AI CLIs installed on this machine.`,
    );
  if (docker) {
    if (values.host !== undefined || values["data-dir"] !== undefined)
      throw new Error(
        "--host and --data-dir can't be used with --docker: the Docker version always listens on localhost and keeps its data in a Docker volume. Use --projects-dir <folder> for project files and --port <number> for the port.",
      );
    const { runDockerCommand } = await import("./docker-install/run.js");
    await runDockerCommand({
      mode: action === "update" ? "update" : "install",
      ...(values.port === undefined ? {} : { port: values.port }),
      ...(values["projects-dir"] === undefined ? {} : { projectsDir: values["projects-dir"] }),
      ...(values["host-cli"] === undefined ? {} : { hostCli: values["host-cli"] }),
      ...(values["accept-host-cli"] === undefined
        ? {}
        : { acceptHostCli: values["accept-host-cli"] }),
      ...(autostart === undefined ? {} : { autostart }),
    });
    process.exit(0);
  }
  if (action === "update") {
    config = configFrom(values, process.env);
    const { runNativeUpdate } = await import("./native-update.js");
    await runNativeUpdate({
      origin: `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}`,
      fetch: globalThis.fetch,
      report: (line) => console.log(line),
    });
    process.exit(0);
  }
  config = configFrom(values, process.env);
  const forwarded = await forwardManagedUpdate(
    config.dataDir,
    readVersion(),
    process.argv.slice(2),
  );
  if (forwarded !== undefined) process.exit(forwarded);
  const booted = await boot(config, {
    refreshAutostart: true,
    prefetchSubtitleModel: ["", "0", "false"].includes(
      (process.env.SLOPIFY_NO_MODEL_PREFETCH ?? "").trim().toLowerCase(),
    ),
    subtitleModelSeed: process.env.SLOPIFY_SUBTITLE_MODEL_SEED?.trim() || undefined,
    seedSample: true,
    // A data dir chosen with --data-dir or SLOPIFY_DATA_DIR keeps a new install's files inside
    // it, so a second or throwaway install never shares a Documents folder with the main one.
    filesInDocuments:
      values["data-dir"] === undefined && (process.env.SLOPIFY_DATA_DIR ?? "") === "",
    refreshModels: ["", "0", "false"].includes(
      (process.env.SLOPIFY_NO_MODEL_REFRESH ?? "").trim().toLowerCase(),
    ),
  });
  const { paths, url, stop } = booted;
  console.log(`Slopify is running at ${url}`);
  console.log(`Slopify data directory: ${paths.dataDir}`);
  console.log(`Projects: ${paths.projects}`);
  console.log(`Database: ${paths.db}`);
  console.log(`Logs: ${paths.logs}`);
  if (config.host !== "127.0.0.1") {
    console.warn(
      `WARNING: bound to ${config.host} - anyone who reaches this port controls the app and its keys (no login).`,
    );
  }
  if (config.open) {
    openBrowser(url, (message) => {
      console.warn(message);
    });
  }
  installSignalShutdown({
    on: (signal, listener) => process.on(signal, listener),
    stop,
    exit: (code) => process.exit(code),
  });
  // After the server is up, so the question never holds Slopify back.
  await settleAutostart({
    autostart: booted.autostart,
    flag: autostart,
    interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    ask: askTerminal,
    report: (line) => console.log(line),
    warn: (line) => console.warn(line),
  });
} catch (error) {
  console.error(explainStartupError(error, config));
  process.exit(1);
}

// Node's own wording for a failed listen or file operation ("listen EADDRINUSE: address already
// in use") names the symptom but not the fix, so the common startup failures are restated here.
function explainStartupError(error: unknown, config: Config | undefined): string {
  if (!(error instanceof Error)) return String(error);
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const syscall = "syscall" in error && typeof error.syscall === "string" ? error.syscall : "";
  if (config !== undefined && syscall === "listen") {
    const other = config.port === 7070 ? 7071 : 7070;
    if (code === "EADDRINUSE")
      return `Port ${config.port} is already in use by another program (maybe another Slopify). Stop that program, or start Slopify on another port: npx @gentbajko/slopify --port ${other}`;
    if (code === "EACCES" || code === "EPERM")
      return `Slopify is not allowed to use port ${config.port}${config.port < 1024 ? " (ports below 1024 need administrator rights)" : ""}. Start it on another port: npx @gentbajko/slopify --port ${other}`;
    if (code === "EADDRNOTAVAIL" || code === "ENOTFOUND" || code === "EAI_AGAIN")
      return `Slopify can't listen on ${config.host} because that address doesn't belong to this machine. Leave out --host (and SLOPIFY_HOST) to use 127.0.0.1, or use an address this machine owns.`;
  }
  const path = "path" in error && typeof error.path === "string" ? error.path : undefined;
  if (
    config !== undefined &&
    path?.startsWith(config.dataDir) &&
    (code === "EACCES" || code === "EPERM" || code === "EROFS")
  )
    return `Slopify can't write to its data folder ${config.dataDir} (${error.message}). Make sure your user owns that folder and can write to it, or choose another one: npx @gentbajko/slopify --data-dir <folder>`;
  if (code === "ENOSPC")
    return `The disk is full (${error.message}). Free up some space and start Slopify again.`;
  return error.message;
}

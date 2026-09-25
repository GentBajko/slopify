import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly dataDir: string;
  readonly open: boolean;
}

export interface ConfigFlags {
  readonly port?: string | undefined;
  readonly host?: string | undefined;
  readonly "data-dir"?: string | undefined;
  readonly "no-open"?: boolean | undefined;
}

export type ConfigEnv = Readonly<Record<string, string | undefined>>;

const defaultPort = 6969;
const defaultHost = "127.0.0.1";

export function configFrom(flags: ConfigFlags, env: ConfigEnv): Config {
  const port = flags.port ?? env.SLOPIFY_PORT;
  const host = flags.host ?? env.SLOPIFY_HOST ?? defaultHost;
  const dataDir = flags["data-dir"] ?? env.SLOPIFY_DATA_DIR ?? join(homedir(), ".slopify");
  if (host.trim() === "") {
    throw new Error(
      `The host setting is empty (from ${flags.host !== undefined ? "--host" : "SLOPIFY_HOST"}). Leave it out to use 127.0.0.1, or give an address such as --host 127.0.0.1.`,
    );
  }
  return {
    port:
      port === undefined
        ? defaultPort
        : parsePort(port, flags.port !== undefined ? "--port" : "SLOPIFY_PORT"),
    host,
    dataDir: resolve(dataDir),
    open: flags["no-open"] === true ? false : !isTruthy(env.SLOPIFY_NO_OPEN),
  };
}

function parsePort(value: string, source: string): number {
  const port = Number(value.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid port ${JSON.stringify(value)} (from ${source}): use a whole number between 1 and 65535, for example --port 7070.`,
    );
  }
  return port;
}

function isTruthy(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalised = value.trim().toLowerCase();
  return normalised !== "" && normalised !== "0" && normalised !== "false";
}
